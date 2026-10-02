import { notFound } from "next/navigation";
import { ExternalLink, GitBranch, Upload } from "lucide-react";
import { getOwnedRepository } from "@/lib/auth";
import { getShellData } from "@/lib/data";
import { RepoTabs } from "@/components/repo/repo-tabs";
import { RepoActions } from "@/components/repo/repo-actions";
import { StatusBadge } from "@/components/app/status";

export default async function RepositoryLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getShellData();
  const repo = await getOwnedRepository(supabase, user.id, id);
  if (!repo) notFound();
  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {repo.source_type === "github" ? <GitBranch className="size-4 text-muted-foreground" /> : <Upload className="size-4 text-muted-foreground" />}
            <h1 className="truncate text-lg font-semibold tracking-tight">{repo.owner ? `${repo.owner}/${repo.name}` : repo.name}</h1>
            <StatusBadge status={repo.analysis_status} />
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {repo.description && <span className="max-w-xl truncate">{repo.description}</span>}
            {repo.default_branch && <span>branch {repo.default_branch}</span>}
            {repo.latest_commit_sha && <span className="font-mono">{repo.latest_commit_sha.slice(0, 7)}</span>}
            {repo.repository_url && (
              <a href={repo.repository_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                GitHub <ExternalLink className="size-3" />
              </a>
            )}
          </p>
        </div>
        <RepoActions id={repo.id} status={repo.analysis_status} />
      </div>
      <RepoTabs id={repo.id} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
