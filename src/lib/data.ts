import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import type { AiSummary, AnalysisFacts, ArchitectureData, Repository, TechItem } from "@/lib/types";

export const ACTIVE_REPO_COOKIE = "cbai_active_repo";

/** Per-request cached session + profile + repositories for the app shell. */
export const getShellData = cache(async () => {
  const { supabase, user } = await requireUser();
  const [{ data: profile }, { data: repos }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase
      .from("repositories")
      .select("id, name, owner, analysis_status, analysis_progress, source_type, updated_at, file_count, languages")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
  ]);
  return {
    supabase,
    user,
    profile: profile as Profile | null,
    repositories: (repos ?? []) as RepoListItem[],
  };
});

export type Profile = {
  id: string;
  display_name: string | null;
  experience_level: "beginner" | "intermediate" | "advanced" | null;
  developer_role: "frontend" | "backend" | "fullstack" | "mobile" | "devops" | "other" | null;
  learning_style: string | null;
  learning_goal: string | null;
  weekly_hours: number | null;
  onboarded_at: string | null;
};

export type RepoListItem = Pick<
  Repository,
  "id" | "name" | "owner" | "analysis_status" | "analysis_progress" | "source_type" | "updated_at" | "file_count" | "languages"
>;

/** Resolves which repository the global "Chat / Architecture / ..." entries should open. */
export async function resolveActiveRepository(section: "chat" | "architecture" | "roadmap" | "explorer") {
  const { repositories } = await getShellData();
  const cookieId = (await cookies()).get(ACTIVE_REPO_COOKIE)?.value;
  const target =
    repositories.find((r) => r.id === cookieId && r.analysis_status === "completed") ??
    repositories.find((r) => r.analysis_status === "completed");
  if (target) redirect(`/repositories/${target.id}/${section}`);
  return repositories;
}

export type AnalysisRow = {
  summary: Partial<AiSummary> & { error?: string };
  technology_stack: TechItem[];
  architecture_data: ArchitectureData;
  dependency_data: { manifests: { path: string; ecosystem: string; dependencies: string[]; devDependencies: string[]; scripts?: Record<string, string> }[]; edgeCount?: number };
  facts: AnalysisFacts & { redactions?: number; embeddings?: boolean };
  created_at: string;
  commit_sha: string | null;
};

export async function getLatestAnalysis(repositoryId: string) {
  const { supabase } = await getShellData();
  const { data } = await supabase
    .from("repository_analyses")
    .select("summary, technology_stack, architecture_data, dependency_data, facts, created_at, commit_sha")
    .eq("repository_id", repositoryId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as AnalysisRow | null;
}
