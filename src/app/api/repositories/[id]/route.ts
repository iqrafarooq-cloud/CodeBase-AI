import { NextResponse } from "next/server";
import { getOwnedRepository, getSessionUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";

/** Lightweight status endpoint polled by the UI while analysis runs. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { supabase, user } = await getSessionUser();
  if (!user) return jsonError(401, "Please sign in again.", "unauthorized");
  const repo = await getOwnedRepository(supabase, user.id, id);
  if (!repo) return jsonError(404, "Repository not found.", "not_found");
  return NextResponse.json({
    status: repo.analysis_status,
    progress: repo.analysis_progress,
    message: repo.analysis_message,
    error: repo.analysis_error,
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { supabase, user } = await getSessionUser();
  if (!user) return jsonError(401, "Please sign in again.", "unauthorized");
  const repo = await getOwnedRepository(supabase, user.id, id);
  if (!repo) return jsonError(404, "Repository not found.", "not_found");
  if (repo.archive_path) await supabase.storage.from("repo-archives").remove([repo.archive_path]);
  const { error } = await supabase.from("repositories").delete().eq("id", repo.id).eq("user_id", user.id);
  if (error) return jsonError(500, "Could not delete the repository.");
  return NextResponse.json({ ok: true });
}
