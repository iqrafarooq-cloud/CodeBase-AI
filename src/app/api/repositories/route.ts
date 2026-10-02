import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { jsonError, readJson, zodError } from "@/lib/http";
import { consumeRateLimit } from "@/lib/rate-limit";
import { canonicalGithubUrl, githubUrlSchema, parseGithubUrl } from "@/lib/repo/github";
import { claimAnalysis, runIngestion } from "@/lib/repo/ingest";

export const maxDuration = 300;

const bodySchema = z.object({ url: githubUrlSchema });

/** Connect a public GitHub repository and start analysis in the background. */
export async function POST(req: Request) {
  const { supabase, user } = await getSessionUser();
  if (!user) return jsonError(401, "Please sign in again.", "unauthorized");

  const parsed = bodySchema.safeParse(await readJson(req, 4096).catch(() => undefined));
  if (!parsed.success) return zodError(parsed.error);
  const ref = parseGithubUrl(parsed.data.url)!;
  const url = canonicalGithubUrl(ref);

  const { data: existing } = await supabase
    .from("repositories")
    .select("id")
    .eq("user_id", user.id)
    .eq("source_type", "github")
    .ilike("repository_url", url)
    .maybeSingle();
  if (existing) return NextResponse.json({ id: existing.id, existing: true });

  if (!(await consumeRateLimit(supabase, "ingest"))) return jsonError(429, "Too many repository imports. Please wait a few minutes.", "rate_limited");

  const { data: repo, error } = await supabase
    .from("repositories")
    .insert({
      user_id: user.id,
      name: ref.repo,
      owner: ref.owner,
      repository_url: url,
      source_type: "github",
      default_branch: ref.ref ?? null,
    })
    .select("id")
    .single();
  if (error || !repo) return jsonError(500, "Could not save the repository.");

  if (await claimAnalysis(repo.id)) after(() => runIngestion(repo.id));
  return NextResponse.json({ id: repo.id }, { status: 201 });
}
