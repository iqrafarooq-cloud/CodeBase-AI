import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { jsonError, readJson, zodError } from "@/lib/http";

const bodySchema = z.object({ status: z.enum(["todo", "done"]) });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return jsonError(400, "Invalid task id.");
  const { supabase, user } = await getSessionUser();
  if (!user) return jsonError(401, "Please sign in again.", "unauthorized");
  const parsed = bodySchema.safeParse(await readJson(req, 1024).catch(() => undefined));
  if (!parsed.success) return zodError(parsed.error);
  // RLS ("tasks: via roadmap") restricts this update to tasks of the user's own roadmaps.
  const { data, error } = await supabase
    .from("onboarding_tasks")
    .update({ status: parsed.data.status, completed_at: parsed.data.status === "done" ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id, status")
    .maybeSingle();
  if (error) return jsonError(500, "Could not update the task.");
  if (!data) return jsonError(404, "Task not found.", "not_found");
  return NextResponse.json(data);
}
