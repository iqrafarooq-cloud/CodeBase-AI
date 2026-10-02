import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { jsonError, readJson, zodError } from "@/lib/http";

const renameSchema = z.object({ title: z.string().trim().min(1).max(120) });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return jsonError(400, "Invalid conversation id.");
  const { supabase, user } = await getSessionUser();
  if (!user) return jsonError(401, "Please sign in again.", "unauthorized");
  const parsed = renameSchema.safeParse(await readJson(req, 2048).catch(() => undefined));
  if (!parsed.success) return zodError(parsed.error);
  const { data, error } = await supabase
    .from("conversations")
    .update({ title: parsed.data.title })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, title")
    .maybeSingle();
  if (error) return jsonError(500, "Could not rename the conversation.");
  if (!data) return jsonError(404, "Conversation not found.", "not_found");
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return jsonError(400, "Invalid conversation id.");
  const { supabase, user } = await getSessionUser();
  if (!user) return jsonError(401, "Please sign in again.", "unauthorized");
  const { error } = await supabase.from("conversations").delete().eq("id", id).eq("user_id", user.id);
  if (error) return jsonError(500, "Could not delete the conversation.");
  return NextResponse.json({ ok: true });
}
