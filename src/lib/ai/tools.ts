import "server-only";
import { tool } from "ai";
import type { SessionSupabase } from "@/lib/auth";
import type { AiSummary, AnalysisFacts, ArchitectureData, Repository, SourceReference, SymbolInfo, TechItem } from "@/lib/types";
import { architectureToMermaid } from "@/lib/architecture";
import { classifyFile } from "@/lib/repo/classify";
import { retrieveChunks, type RetrievedChunk } from "./retrieval";
import { generateAndSaveRoadmap } from "./roadmap";
import {
  analyzeRepositoryInput,
  explainFileInput,
  findEntryPointsInput,
  generateArchitectureInput,
  generateRoadmapInput,
  searchCodeInput,
  traceWorkflowInput,
} from "./tool-schemas";

type Ctx = { supabase: SessionSupabase; userId: string; repo: Repository };

const MAX_FILE_LINES = 300;
const MAX_EXCERPT_CHARS = 2400;

function excerpt(content: string, max = MAX_EXCERPT_CHARS) {
  return content.length > max ? content.slice(0, max) + "\n… (truncated)" : content;
}

function chunkToEvidence(c: RetrievedChunk) {
  return { path: c.path, startLine: c.startLine, endLine: c.endLine, symbol: c.symbol, code: excerpt(c.content) };
}

function chunkToSource(c: RetrievedChunk): SourceReference {
  return { path: c.path, startLine: c.startLine, endLine: c.endLine, symbol: c.symbol, excerpt: c.content.slice(0, 600) };
}

function numbered(lines: string[], start: number) {
  return lines.map((l, i) => `${String(start + i).padStart(4, " ")}| ${l}`).join("\n");
}

/** Wraps execution so tool failures become structured results the model can explain. */
function safe<I, O>(fn: (input: I) => Promise<O>) {
  return async (input: I) => {
    try {
      return await fn(input);
    } catch (e) {
      console.warn("tool failed:", e instanceof Error ? e.message : e);
      return { error: "The tool failed to run. Tell the user what could not be checked.", sources: [] as SourceReference[] };
    }
  };
}

async function latestAnalysis(ctx: Ctx) {
  const { data } = await ctx.supabase
    .from("repository_analyses")
    .select("summary, technology_stack, architecture_data, dependency_data, facts, created_at")
    .eq("repository_id", ctx.repo.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as {
    summary: Partial<AiSummary> & { error?: string };
    technology_stack: TechItem[];
    architecture_data: ArchitectureData;
    dependency_data: { manifests: { path: string; ecosystem: string; dependencies: string[]; devDependencies: string[]; scripts?: Record<string, string> }[] };
    facts: AnalysisFacts;
  } | null;
}

/** Read-only tools bound to one repository and the signed-in user's RLS-scoped client. */
export function createAgentTools(ctx: Ctx) {
  const { supabase, repo } = ctx;

  return {
    search_code: tool({
      description: "Search the selected repository's indexed code (semantic + keyword + symbol). Returns matching chunks with file paths and line ranges. Use before answering any question about specific code.",
      inputSchema: searchCodeInput,
      execute: safe(async ({ query, limit }) => {
        const [chunks, files] = await Promise.all([
          retrieveChunks(supabase, repo.id, query, { topK: limit }),
          supabase
            .from("repository_files")
            .select("file_path")
            .eq("repository_id", repo.id)
            .ilike("file_path", `%${query.replace(/[%_\\]/g, "").split(/\s+/)[0]}%`)
            .limit(8),
        ]);
        return {
          results: chunks.map(chunkToEvidence),
          matchingFilePaths: (files.data ?? []).map((f) => f.file_path),
          note: chunks.length ? undefined : "No indexed code matched. Say that the evidence was not found rather than guessing.",
          sources: chunks.map(chunkToSource),
        };
      }),
    }),

    explain_file: tool({
      description: "Load a file's source (with line numbers), its symbols, what it imports and which files import it. Use to explain a specific file.",
      inputSchema: explainFileInput,
      execute: safe(async ({ path, startLine, endLine }) => {
        const { data: file } = await supabase
          .from("repository_files")
          .select("file_path, language, line_count, content, symbols, imports")
          .eq("repository_id", repo.id)
          .eq("file_path", path)
          .maybeSingle();
        if (!file) {
          const base = path.split("/").pop() ?? path;
          const { data: similar } = await supabase
            .from("repository_files")
            .select("file_path")
            .eq("repository_id", repo.id)
            .ilike("file_path", `%${base.replace(/[%_\\]/g, "")}%`)
            .limit(8);
          return { error: `File "${path}" does not exist in this repository.`, similarPaths: (similar ?? []).map((s) => s.file_path), sources: [] };
        }
        if (file.content === null) return { error: "File is too large to display.", path, sources: [] };
        const { data: importers } = await supabase
          .from("repository_files")
          .select("file_path")
          .eq("repository_id", repo.id)
          .contains("imports", [path])
          .limit(20);
        const lines = (file.content as string).split("\n");
        const start = Math.max(1, startLine ?? 1);
        const end = Math.min(lines.length, endLine ?? start + MAX_FILE_LINES - 1, start + MAX_FILE_LINES - 1);
        return {
          path,
          language: file.language,
          totalLines: lines.length,
          shownLines: `${start}-${end}`,
          truncated: end < lines.length || start > 1,
          source: numbered(lines.slice(start - 1, end), start),
          symbols: (file.symbols as SymbolInfo[]).slice(0, 60).map((s) => `${s.kind} ${s.name} (L${s.line}-L${s.endLine})`),
          imports: file.imports,
          importedBy: (importers ?? []).map((i) => i.file_path),
          sources: [{ path, startLine: start, endLine: end, excerpt: lines.slice(start - 1, Math.min(end, start + 15)).join("\n") }],
        };
      }),
    }),

    trace_workflow: tool({
      description: "Trace a feature or workflow (e.g. login, checkout, a request) across files: finds relevant code, groups it by layer (frontend, api, backend, database...) and returns the import links between the involved files. Use for 'how does X work' / 'trace X' questions and workflow diagrams.",
      inputSchema: traceWorkflowInput,
      execute: safe(async ({ feature }) => {
        const chunks = await retrieveChunks(supabase, repo.id, feature, { topK: 12 });
        if (!chunks.length) return { steps: [], links: [], note: "No code related to this workflow was found in the index.", sources: [] };
        const paths = [...new Set(chunks.map((c) => c.path))].slice(0, 10);
        const { data: files } = await supabase
          .from("repository_files")
          .select("file_path, language, imports")
          .eq("repository_id", repo.id)
          .in("file_path", paths);
        const inSet = new Set(paths);
        const links = (files ?? []).flatMap((f) =>
          (f.imports as string[]).filter((to) => inSet.has(to)).map((to) => ({ from: f.file_path as string, to, evidence: "static import" })),
        );
        const order = ["frontend", "auth", "api", "backend", "module", "database", "tests", "config"];
        const steps = paths
          .map((p) => {
            const f = (files ?? []).find((x) => x.file_path === p);
            const layer = f ? classifyFile({ path: p, language: f.language as string }) ?? "other" : "other";
            return { path: p, layer, evidence: chunks.filter((c) => c.path === p).slice(0, 2).map(chunkToEvidence) };
          })
          .sort((a, b) => order.indexOf(a.layer) - order.indexOf(b.layer));
        return {
          steps,
          links,
          note: "Layers come from path/file-type heuristics; links are resolved static imports. Order steps by actual call flow visible in the code, and say where the flow could not be confirmed.",
          sources: chunks.map(chunkToSource),
        };
      }),
    }),

    analyze_repository: tool({
      description: "Return the saved repository analysis: purpose, technology stack, structure, dependencies, routes or documentation coverage. Deterministic facts are separated from AI-inferred summary fields.",
      inputSchema: analyzeRepositoryInput,
      execute: safe(async ({ aspect }) => {
        const a = await latestAnalysis(ctx);
        if (!a) return { error: "This repository has not been analyzed yet.", sources: [] };
        const base = { repository: repo.name, files: repo.file_count, languages: repo.languages };
        switch (aspect) {
          case "technology":
            return { ...base, confirmedTechnology: a.technology_stack, sources: [] };
          case "structure":
            return { ...base, directories: a.facts.directories, importantFiles: a.facts.importantFiles, entryPoints: a.facts.entryPoints, sources: [] };
          case "dependencies":
            return {
              ...base,
              manifests: a.dependency_data.manifests.map((m) => ({ ...m, dependencies: m.dependencies.slice(0, 60), devDependencies: m.devDependencies.slice(0, 40) })),
              sources: [],
            };
          case "routes":
            return { ...base, routes: a.facts.routes.slice(0, 80), sources: [] };
          case "documentation":
            return { ...base, docs: { ...a.facts.docs, readme: a.facts.docs.readme?.slice(0, 2500) }, aiNotes: a.summary.documentationNotes, sources: [] };
          default:
            return {
              ...base,
              confirmedFacts: {
                technology: a.technology_stack.map((t) => t.name),
                entryPoints: a.facts.entryPoints,
                topDirectories: a.facts.directories.slice(0, 15),
                routeCount: a.facts.routes.length,
              },
              aiInferredSummary: a.summary.error ? null : { purpose: a.summary.purpose, overview: a.summary.overview, keyModules: a.summary.keyModules, workflows: a.summary.workflows },
              sources: [],
            };
        }
      }),
    }),

    generate_architecture: tool({
      description: "Return the analyzed architecture graph (layers/modules, external services and their relationships) plus a ready-made Mermaid diagram. Static edges come from resolved imports; inferred edges are string-match heuristics.",
      inputSchema: generateArchitectureInput,
      execute: safe(async ({ focus }) => {
        const a = await latestAnalysis(ctx);
        if (!a) return { error: "This repository has not been analyzed yet.", sources: [] };
        let data = a.architecture_data;
        if (focus) {
          const f = focus.toLowerCase();
          const ids = new Set(data.nodes.filter((n) => n.id.toLowerCase().includes(f) || n.label.toLowerCase().includes(f)).map((n) => n.id));
          if (ids.size) {
            const edges = data.edges.filter((e) => ids.has(e.source) || ids.has(e.target));
            const keep = new Set([...ids, ...edges.flatMap((e) => [e.source, e.target])]);
            data = { nodes: data.nodes.filter((n) => keep.has(n.id)), edges };
          }
        }
        return {
          nodes: data.nodes.map((n) => ({ id: n.id, label: n.label, kind: n.kind, fileCount: n.files.length, sampleFiles: n.files.slice(0, 5) })),
          edges: data.edges.map((e) => ({ source: e.source, target: e.target, evidence: e.evidence, weight: e.weight, example: e.examples[0] })),
          mermaid: architectureToMermaid(data),
          explorerUrl: `/repositories/${repo.id}/architecture`,
          sources: [],
        };
      }),
    }),

    generate_onboarding_roadmap: tool({
      description: "Create (or regenerate) and save a personalised onboarding roadmap for this repository using the user's profile. Only call when the user explicitly asks for a roadmap.",
      inputSchema: generateRoadmapInput,
      execute: safe(async () => {
        const result = await generateAndSaveRoadmap(supabase, ctx.userId, repo);
        return { ...result, url: `/repositories/${repo.id}/roadmap`, sources: [] };
      }),
    }),

    find_entry_points: tool({
      description: "List the application's detected entry points (how execution begins) with the first lines of each file.",
      inputSchema: findEntryPointsInput,
      execute: safe(async () => {
        const a = await latestAnalysis(ctx);
        if (!a) return { error: "This repository has not been analyzed yet.", sources: [] };
        const eps = a.facts.entryPoints.slice(0, 8);
        if (!eps.length) return { entryPoints: [], note: "No conventional entry points were detected.", sources: [] };
        const { data: files } = await supabase
          .from("repository_files")
          .select("file_path, content")
          .eq("repository_id", repo.id)
          .in("file_path", eps.map((e) => e.path));
        const sources: SourceReference[] = [];
        const entryPoints = eps.map((e) => {
          const content = ((files ?? []).find((f) => f.file_path === e.path)?.content as string | null) ?? "";
          const lines = content.split("\n").slice(0, 40);
          if (content) sources.push({ path: e.path, startLine: 1, endLine: lines.length, excerpt: lines.slice(0, 15).join("\n") });
          return { path: e.path, reason: e.reason, firstLines: content ? numbered(lines, 1) : "(content unavailable)" };
        });
        return { entryPoints, sources };
      }),
    }),
  };
}
