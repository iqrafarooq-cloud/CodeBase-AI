import { NextResponse } from "next/server";
import { z } from "zod";
import { getOwnedRepository, getSessionUser } from "@/lib/auth";
import { jsonError, readJson, zodError } from "@/lib/http";

const bodySchema = z.object({ repositoryId: z.uuid() });

export async function POST(req: Request) {
  const { supabase, user } = await getSessionUser();
  if (!user) return jsonError(401, "Please sign in again.", "unauthorized");
  const parsed = bodySchema.safeParse(await readJson(req, 1024).catch(() => undefined));
  if (!parsed.success) return zodError(parsed.error);
  const repo = await getOwnedRepository(supabase, user.id, parsed.data.repositoryId);
  if (!repo) return jsonError(404, "Repository not found.", "not_found");
  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: user.id, repository_id: repo.id })
    .select("id, title, created_at, updated_at")
    .single();
  if (error || !data) return jsonError(500, "Could not create a conversation.");
  return NextResponse.json(data, { status: 201 });
}
