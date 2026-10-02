import "server-only";
import { notFound } from "next/navigation";
import { getOwnedRepository } from "@/lib/auth";
import { getShellData } from "@/lib/data";

/** Loads a repository the session user owns, or 404s. */
export async function loadRepository(id: string) {
  const { supabase, user } = await getShellData();
  const repo = await getOwnedRepository(supabase, user.id, id);
  if (!repo) notFound();
  const gate = {
    status: repo.analysis_status,
    progress: repo.analysis_progress,
    message: repo.analysis_message,
    error: repo.analysis_error,
  };
  return { repo, supabase, user, gate, ready: repo.analysis_status === "completed" };
}
