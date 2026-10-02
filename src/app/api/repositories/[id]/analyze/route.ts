import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnedRepository, getSessionUser } from "@/lib/auth";
import { jsonError, readJson } from "@/lib/http";
import { consumeRateLimit } from "@/lib/rate-limit";
import { claimAnalysis, runIngestion } from "@/lib/repo/ingest";

export const maxDuration = 300;

const bodySchema = z.object({ force: z.boolean().default(false) });

/** Retry a failed analysis or refresh/re-index an existing one. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { supabase, user } = await getSessionUser();
  if (!user) return jsonError(401, "Please sign in again.", "unauthorized");
  const repo = await getOwnedRepository(supabase, user.id, id);
  if (!repo) return jsonError(404, "Repository not found.", "not_found");

  const { force } = bodySchema.parse((await readJson(req, 1024).catch(() => undefined)) ?? {});
  if (!(await consumeRateLimit(supabase, "ingest"))) return jsonError(429, "Too many analysis requests. Please wait a few minutes.", "rate_limited");
  if (!(await claimAnalysis(repo.id))) return jsonError(409, "An analysis is already running for this repository.", "in_progress");

  after(() => runIngestion(repo.id, { force }));
  return NextResponse.json({ ok: true }, { status: 202 });
}
