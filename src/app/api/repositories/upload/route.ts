import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { jsonError, readJson, zodError } from "@/lib/http";
import { consumeRateLimit } from "@/lib/rate-limit";
import { claimAnalysis, runIngestion } from "@/lib/repo/ingest";

export const maxDuration = 300;

const bodySchema = z.object({
  name: z.string().trim().min(1).max(100).regex(/^[\w .-]+$/, "Use letters, numbers, spaces, dots, dashes or underscores"),
  storagePath: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.zip$/, "Invalid upload reference"),
});

/**
 * Registers a ZIP the browser uploaded directly to the private "repo-archives" bucket
 * (under the user's own folder, enforced by storage RLS) and starts analysis.
 */
export async function POST(req: Request) {
  const { supabase, user } = await getSessionUser();
  if (!user) return jsonError(401, "Please sign in again.", "unauthorized");

  const parsed = bodySchema.safeParse(await readJson(req, 4096).catch(() => undefined));
  if (!parsed.success) return zodError(parsed.error);
  const { name, storagePath } = parsed.data;
  if (!storagePath.startsWith(`${user.id}/`)) return jsonError(403, "You can only analyze your own uploads.", "forbidden");

  if (!(await consumeRateLimit(supabase, "ingest"))) return jsonError(429, "Too many repository imports. Please wait a few minutes.", "rate_limited");

  const { data: repo, error } = await supabase
    .from("repositories")
    .insert({ user_id: user.id, name, source_type: "zip", archive_path: storagePath })
    .select("id")
    .single();
  if (error || !repo) return jsonError(500, "Could not save the repository.");

  if (await claimAnalysis(repo.id)) after(() => runIngestion(repo.id));
  return NextResponse.json({ id: repo.id }, { status: 201 });
}
