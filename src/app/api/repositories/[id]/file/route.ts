import { NextResponse } from "next/server";
import { getOwnedRepository, getSessionUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";

/** Returns one file's (secret-redacted) content and symbols for the Code Explorer. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const path = new URL(req.url).searchParams.get("path") ?? "";
  if (!path || path.length > 500 || path.includes("..")) return jsonError(400, "Invalid file path.");
  const { supabase, user } = await getSessionUser();
  if (!user) return jsonError(401, "Please sign in again.", "unauthorized");
  const repo = await getOwnedRepository(supabase, user.id, id);
  if (!repo) return jsonError(404, "Repository not found.", "not_found");
  const { data: file } = await supabase
    .from("repository_files")
    .select("file_path, language, file_size, line_count, content, symbols, imports, parse_error")
    .eq("repository_id", repo.id)
    .eq("file_path", path)
    .maybeSingle();
  if (!file) return jsonError(404, "File not found in this repository.", "not_found");
  return NextResponse.json(file, { headers: { "cache-control": "private, max-age=60" } });
}
