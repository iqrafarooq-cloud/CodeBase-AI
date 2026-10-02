"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v ? v : null))
    .nullable()
    .optional();

const profileSchema = z.object({
  display_name: z.string().trim().min(1, "Display name is required").max(80),
  experience_level: z.enum(["beginner", "intermediate", "advanced"]).nullable().optional(),
  developer_role: z.enum(["frontend", "backend", "fullstack", "mobile", "devops", "other"]).nullable().optional(),
  learning_style: optionalText(200),
  learning_goal: optionalText(500),
  weekly_hours: z.coerce.number().int().min(1).max(80).nullable().optional(),
});

export type ProfileInput = z.input<typeof profileSchema>;

/** Saves the signed-in user's profile. The row id always comes from the session. */
export async function saveProfile(input: ProfileInput): Promise<{ error?: string }> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { supabase, user } = await getSessionUser();
  if (!user) return { error: "Your session has expired. Please sign in again." };
  const { error } = await supabase
    .from("profiles")
    .update({ ...parsed.data, onboarded_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) return { error: "Could not save your profile." };
  revalidatePath("/", "layout");
  return {};
}
