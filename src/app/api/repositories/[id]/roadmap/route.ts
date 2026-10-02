import { NextResponse } from "next/server";
import { getOwnedRepository, getSessionUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { consumeRateLimit } from "@/lib/rate-limit";
import { generateAndSaveRoadmap } from "@/lib/ai/roadmap";

export const maxDuration = 120;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { supabase, user } = await getSessionUser();
  if (!user) return jsonError(401, "Please sign in again.", "unauthorized");
  const repo = await getOwnedRepository(supabase, user.id, id);
  if (!repo) return jsonError(404, "Repository not found.", "not_found");
  if (repo.analysis_status !== "completed") return jsonError(409, "Analyze the repository before generating a roadmap.", "not_ready");
  if (!(await consumeRateLimit(supabase, "roadmap"))) return jsonError(429, "Too many roadmap requests. Please wait a few minutes.", "rate_limited");
  try {
    const result = await generateAndSaveRoadmap(supabase, user.id, repo);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    console.error("roadmap generation failed:", e instanceof Error ? e.message : e);
    return jsonError(500, "Roadmap generation failed. Please try again.");
  }
}
