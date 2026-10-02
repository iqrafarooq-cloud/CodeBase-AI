import { AnalysisGate } from "@/components/repo/analysis-gate";
import { RoadmapClient, type RoadmapTask } from "@/components/roadmap/roadmap-client";
import { loadRepository } from "@/lib/repo-page";

export const metadata = { title: "Onboarding Roadmap" };

export default async function RoadmapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { repo, supabase, user, gate, ready } = await loadRepository(id);
  if (!ready) return <AnalysisGate id={repo.id} initial={gate} />;

  const { data: roadmap } = await supabase
    .from("onboarding_roadmaps")
    .select("id, title, summary, generated_by, experience_level, developer_role, learning_goal, created_at, onboarding_tasks(id, title, description, why_it_matters, relevant_files, suggested_questions, estimated_minutes, status, sort_order)")
    .eq("user_id", user.id)
    .eq("repository_id", repo.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const tasks = ((roadmap?.onboarding_tasks ?? []) as RoadmapTask[]).sort((a, b) => a.sort_order - b.sort_order);
  return (
    <RoadmapClient
      key={roadmap?.id ?? "none"}
      repositoryId={repo.id}
      roadmap={
        roadmap
          ? {
              id: roadmap.id,
              title: roadmap.title,
              summary: roadmap.summary,
              generatedBy: roadmap.generated_by,
              experienceLevel: roadmap.experience_level,
              role: roadmap.developer_role,
              goal: roadmap.learning_goal,
              createdAt: roadmap.created_at,
            }
          : null
      }
      tasks={tasks}
    />
  );
}
