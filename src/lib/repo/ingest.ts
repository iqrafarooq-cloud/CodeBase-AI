import "server-only";
import { createHash } from "node:crypto";
import { Octokit } from "octokit";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import type { Repository } from "@/lib/types";
import { embedTexts, embeddingsEnabled } from "@/lib/ai/provider";
import { generateProjectSummary } from "@/lib/ai/summary";
import { analyzeFiles } from "./analyzer";
import { ArchiveError, extractArchive } from "./archive";
import { chunkFile, embeddingText } from "./chunker";
import { detectLanguage } from "./languages";
import { redactSecrets } from "./secrets";

export const ANALYSIS_VERSION = 1;
const STALE_LOCK_MS = 15 * 60 * 1000;
const MAX_STORED_CONTENT = 256 * 1024;
const BATCH = 200;
const EMBED_BATCH = 96;

/** User-facing failure. Anything else is reported as a generic error (details only in logs). */
export class IngestError extends Error {}

/**
 * Atomically moves a repository into "processing". Returns false if another job already
 * holds a fresh lock, which prevents duplicate concurrent analyses.
 */
export async function claimAnalysis(repositoryId: string): Promise<boolean> {
  const admin = createAdminClient();
  const staleBefore = new Date(Date.now() - STALE_LOCK_MS).toISOString();
  const { data, error } = await admin
    .from("repositories")
    .update({
      analysis_status: "processing",
      analysis_progress: 1,
      analysis_message: "Queued",
      analysis_error: null,
      analysis_started_at: new Date().toISOString(),
    })
    .eq("id", repositoryId)
    .or(`analysis_status.neq.processing,analysis_started_at.lt.${staleBefore},analysis_started_at.is.null`)
    .select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

async function progress(admin: AdminClient, id: string, pct: number, message: string) {
  await admin.from("repositories").update({ analysis_progress: pct, analysis_message: message }).eq("id", id);
}

function octokit() {
  return new Octokit({ auth: serverEnv().GITHUB_TOKEN, request: { timeout: 60_000 } });
}

async function fetchGithubArchive(repo: Repository) {
  const env = serverEnv();
  if (!repo.owner) throw new IngestError("Repository owner is missing.");
  const gh = octokit();
  try {
    const { data: meta } = await gh.rest.repos.get({ owner: repo.owner, repo: repo.name });
    if (meta.size > env.MAX_ARCHIVE_MB * 1024 * 4) {
      throw new IngestError(`This repository is too large to analyze (${Math.round(meta.size / 1024)} MB on GitHub).`);
    }
    const branch = repo.default_branch ?? meta.default_branch;
    const { data: br } = await gh.rest.repos.getBranch({ owner: repo.owner, repo: repo.name, branch });
    const sha = br.commit.sha;
    const { data } = await gh.rest.repos.downloadZipballArchive({ owner: repo.owner, repo: repo.name, ref: sha });
    const bytes = new Uint8Array(data as ArrayBuffer);
    if (bytes.length > env.MAX_ARCHIVE_MB * 1024 * 1024) throw new IngestError(`Repository archive exceeds ${env.MAX_ARCHIVE_MB} MB.`);
    return { bytes, sha, branch, description: meta.description, isPrivate: meta.private };
  } catch (e) {
    if (e instanceof IngestError) throw e;
    const status = (e as { status?: number }).status;
    if (status === 404) throw new IngestError("Repository not found. It may be private or the URL may be wrong. Only public repositories are supported without a GitHub token.");
    if (status === 403 || status === 429) throw new IngestError("GitHub rate limit reached. Try again later, or configure GITHUB_TOKEN on the server.");
    if (status === 401) throw new IngestError("GitHub rejected the server credentials (GITHUB_TOKEN).");
    throw e;
  }
}

async function fetchZipArchive(admin: AdminClient, repo: Repository) {
  if (!repo.archive_path || !repo.archive_path.startsWith(`${repo.user_id}/`)) throw new IngestError("Uploaded archive not found.");
  const { data, error } = await admin.storage.from("repo-archives").download(repo.archive_path);
  if (error || !data) throw new IngestError("Uploaded archive could not be read. Please upload it again.");
  const bytes = new Uint8Array(await data.arrayBuffer());
  return { bytes, sha: createHash("sha256").update(bytes).digest("hex").slice(0, 40) };
}

/** Full (re-)index of a repository. Must be called after claimAnalysis() succeeded. */
export async function runIngestion(repositoryId: string, opts: { force?: boolean } = {}) {
  const admin = createAdminClient();
  const env = serverEnv();
  const { data: repoRow } = await admin.from("repositories").select("*").eq("id", repositoryId).single();
  const repo = repoRow as Repository | null;
  if (!repo) return;

  try {
    await progress(admin, repo.id, 5, "Downloading source");
    let bytes: Uint8Array;
    let sha: string;
    const meta: Partial<Repository> = {};
    if (repo.source_type === "github") {
      const gh = await fetchGithubArchive(repo);
      bytes = gh.bytes;
      sha = gh.sha;
      meta.default_branch = gh.branch;
      meta.description = gh.description ?? null;
    } else {
      ({ bytes, sha } = await fetchZipArchive(admin, repo));
    }

    if (!opts.force && repo.latest_commit_sha === sha && repo.analyzed_at && repo.chunk_count > 0) {
      await admin
        .from("repositories")
        .update({ analysis_status: "completed", analysis_progress: 100, analysis_message: "Already up to date", ...meta })
        .eq("id", repo.id);
      return;
    }

    await progress(admin, repo.id, 15, "Extracting files");
    let extracted;
    try {
      extracted = extractArchive(bytes, { maxFiles: env.MAX_REPO_FILES, maxTotalBytes: env.MAX_REPO_TOTAL_MB * 1024 * 1024 });
    } catch (e) {
      if (e instanceof ArchiveError) throw new IngestError(e.message);
      throw e;
    }
    if (extracted.files.length === 0) throw new IngestError("No supported source files were found in this repository.");

    let redactionCount = 0;
    const sources = extracted.files.map((f) => {
      const { text, redactions } = redactSecrets(f.content);
      redactionCount += redactions;
      return { path: f.path, size: f.size, content: text, language: detectLanguage(f.path) };
    });

    await progress(admin, repo.id, 30, `Analyzing ${sources.length} files`);
    const analysis = analyzeFiles(sources, { skipped: extracted.skipped as Record<string, number>, truncated: extracted.truncated });

    // Idempotent re-index: replace previous rows (chunks cascade from files).
    await admin.from("repository_files").delete().eq("repository_id", repo.id);

    const fileIds = new Map<string, string>();
    for (let i = 0; i < analysis.files.length; i += BATCH) {
      const rows = analysis.files.slice(i, i + BATCH).map((f) => ({
        repository_id: repo.id,
        file_path: f.path,
        language: f.language,
        file_size: f.size,
        line_count: f.content.split("\n").length,
        content_hash: createHash("sha1").update(f.content).digest("hex"),
        content: f.content.length <= MAX_STORED_CONTENT ? f.content : null,
        symbols: f.symbols,
        imports: f.resolvedImports,
        parse_error: f.parseError ?? null,
      }));
      const { data, error } = await admin.from("repository_files").insert(rows).select("id, file_path");
      if (error) throw error;
      for (const r of data ?? []) fileIds.set(r.file_path, r.id);
    }

    await progress(admin, repo.id, 45, "Chunking source code");
    const chunks = analysis.files
      .filter((f) => !(f.language === "json" && f.size > 20_000 && !f.path.endsWith("package.json")))
      .flatMap((f) =>
        chunkFile(f).map((c) => ({
          repository_id: repo.id,
          file_id: fileIds.get(f.path)!,
          file_path: f.path,
          language: f.language,
          symbol_name: c.symbolName,
          symbol_kind: c.symbolKind,
          chunk_content: c.content,
          start_line: c.startLine,
          end_line: c.endLine,
          commit_sha: sha,
          embedding: null as string | null,
        })),
      )
      .filter((c) => c.file_id);

    if (embeddingsEnabled()) {
      for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
        const batch = chunks.slice(i, i + EMBED_BATCH);
        const vectors = await embedTexts(batch.map((c) => embeddingText(c.file_path, { symbolName: c.symbol_name, content: c.chunk_content })));
        vectors?.forEach((v, j) => (batch[j].embedding = v ? JSON.stringify(v) : null));
        await progress(admin, repo.id, 45 + Math.round((35 * Math.min(i + EMBED_BATCH, chunks.length)) / chunks.length), `Embedding code (${Math.min(i + EMBED_BATCH, chunks.length)}/${chunks.length})`);
      }
    }

    for (let i = 0; i < chunks.length; i += BATCH) {
      const { error } = await admin.from("code_chunks").insert(chunks.slice(i, i + BATCH));
      if (error) throw error;
    }

    await progress(admin, repo.id, 85, "Generating project overview");
    let summary: Record<string, unknown> = {};
    try {
      summary = (await generateProjectSummary(repo.name, analysis)) as unknown as Record<string, unknown>;
    } catch (e) {
      // AI interpretation is optional; deterministic facts are still saved.
      summary = { error: e instanceof Error && e.message.includes("not configured") ? e.message : "AI overview could not be generated." };
      console.warn("summary generation failed for repository", repo.id);
    }

    const { error: analysisError } = await admin.from("repository_analyses").insert({
      repository_id: repo.id,
      summary,
      technology_stack: analysis.techStack,
      architecture_data: analysis.architecture,
      dependency_data: { manifests: analysis.dependencies.manifests, edgeCount: analysis.dependencies.internalEdges.length },
      facts: { ...analysis.facts, redactions: redactionCount, embeddings: embeddingsEnabled() },
      analysis_version: ANALYSIS_VERSION,
      commit_sha: sha,
    });
    if (analysisError) throw analysisError;

    await admin
      .from("repositories")
      .update({
        ...meta,
        analysis_status: "completed",
        analysis_progress: 100,
        analysis_message: extracted.truncated ? "Completed (file limit reached - some files were skipped)" : "Completed",
        analyzed_at: new Date().toISOString(),
        latest_commit_sha: sha,
        file_count: analysis.files.length,
        chunk_count: chunks.length,
        languages: analysis.languages,
      })
      .eq("id", repo.id);
  } catch (e) {
    const message = e instanceof IngestError ? e.message : "Analysis failed due to an internal error. Please retry.";
    if (!(e instanceof IngestError)) console.error("ingestion failed", repo.id, e instanceof Error ? e.message : e);
    await admin
      .from("repositories")
      .update({ analysis_status: "failed", analysis_error: message, analysis_message: "Failed" })
      .eq("id", repo.id);
  }
}
