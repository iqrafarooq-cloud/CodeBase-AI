import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Repository } from "@/lib/types";

/** Resolve the signed-in user from the session (never from client input). */
export async function getSessionUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { supabase, user: null } as const;
  return { supabase, user: data.user } as const;
}

export async function requireUser() {
  const { supabase, user } = await getSessionUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export type SessionSupabase = Awaited<ReturnType<typeof createClient>>;

/** Loads a repository only if the session user owns it (RLS + explicit check). */
export async function getOwnedRepository(supabase: SessionSupabase, userId: string, repositoryId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(repositoryId)) return null;
  const { data } = await supabase
    .from("repositories")
    .select("*")
    .eq("id", repositoryId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as Repository | null) ?? null;
}
