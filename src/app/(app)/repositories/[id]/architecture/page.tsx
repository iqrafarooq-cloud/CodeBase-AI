import Link from "next/link";
import { Network, Workflow } from "lucide-react";
import { AnalysisGate } from "@/components/repo/analysis-gate";
import { ArchitectureMap } from "@/components/architecture/architecture-map";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";
import { getLatestAnalysis } from "@/lib/data";
import { loadRepository } from "@/lib/repo-page";

export const metadata = { title: "Architecture Explorer" };

const WORKFLOW_PROMPTS = ["Show me how a user logs in.", "Trace a request from the frontend to the backend.", "How is data saved to the database?"];

export default async function ArchitecturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { repo, gate, ready } = await loadRepository(id);
  if (!ready) return <AnalysisGate id={repo.id} initial={gate} />;
  const analysis = await getLatestAnalysis(repo.id);
  const data = analysis?.architecture_data;

  return (
    <div className="space-y-4">
      {!data || data.nodes.length === 0 ? (
        <EmptyState icon={Network} title="No architecture detected" description="No source files could be classified into modules. The repository may contain only documentation or configuration." />
      ) : (
        <ArchitectureMap repositoryId={repo.id} data={data} />
      )}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
        <Workflow className="size-5 shrink-0 text-primary" />
        <div className="flex-1">
          <p className="text-sm font-medium">Workflow diagrams</p>
          <p className="text-xs text-muted-foreground">Ask the assistant to trace a feature. It searches the code and draws a diagram only from the evidence it finds.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {WORKFLOW_PROMPTS.map((p) => (
            <Button key={p} size="sm" variant="outline" asChild>
              <Link href={`/repositories/${repo.id}/chat?q=${encodeURIComponent(p + " Include a workflow diagram.")}`}>{p}</Link>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
