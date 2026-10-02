import Link from "next/link";
import { FolderGit2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/app/status";
import type { RepoListItem } from "@/lib/data";

/** Shown by the global section entries when no analyzed repository can be opened directly. */
export function PickRepository({ title, repositories }: { title: string; repositories: RepoListItem[] }) {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={title} />
      {repositories.length === 0 ? (
        <EmptyState
          icon={FolderGit2}
          title="No repositories connected"
          description="Connect a repository first. Once it is analyzed, this section opens automatically."
          action={<Button asChild><Link href="/repositories/new"><Plus /> Connect repository</Link></Button>}
        />
      ) : (
        <EmptyState
          icon={FolderGit2}
          title="No analyzed repository yet"
          description="Your repositories are still being analyzed or the analysis failed. Open one to check its status."
          action={
            <ul className="w-72 space-y-1 text-left">
              {repositories.slice(0, 6).map((r) => (
                <li key={r.id}>
                  <Link href={`/repositories/${r.id}`} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                    <span className="truncate">{r.owner ? `${r.owner}/${r.name}` : r.name}</span>
                    <StatusBadge status={r.analysis_status} />
                  </Link>
                </li>
              ))}
            </ul>
          }
        />
      )}
    </div>
  );
}
