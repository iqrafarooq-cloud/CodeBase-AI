import Link from "next/link";
import { FolderGit2, GitBranch, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader, Progress } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/app/status";
import { getShellData } from "@/lib/data";
import { CODE_LANGUAGES, displayLanguage } from "@/lib/repo/languages";
import { formatRelative } from "@/lib/utils";

export const metadata = { title: "My Repositories" };

export default async function RepositoriesPage() {
  const { repositories } = await getShellData();
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="My Repositories"
        description="Repositories you have connected for analysis."
        actions={
          <Button asChild>
            <Link href="/repositories/new"><Plus /> Connect repository</Link>
          </Button>
        }
      />
      {repositories.length === 0 ? (
        <EmptyState
          icon={FolderGit2}
          title="No repositories yet"
          description="Import a public GitHub repository or upload a ZIP archive. Analysis usually takes under a minute."
          action={<Button asChild><Link href="/repositories/new"><Plus /> Connect repository</Link></Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {repositories.map((r) => {
            const langs = Object.entries(r.languages ?? {})
              .filter(([l]) => CODE_LANGUAGES.has(l))
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([l]) => displayLanguage(l));
            return (
              <Link key={r.id} href={`/repositories/${r.id}`} className="group">
                <Card className="h-full p-4 transition-colors group-hover:border-primary/40">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {r.source_type === "github" ? <GitBranch className="size-4 shrink-0 text-muted-foreground" /> : <Upload className="size-4 shrink-0 text-muted-foreground" />}
                      <span className="truncate text-sm font-semibold">{r.owner ? `${r.owner}/${r.name}` : r.name}</span>
                    </div>
                    <StatusBadge status={r.analysis_status} />
                  </div>
                  {r.analysis_status === "processing" && <Progress value={r.analysis_progress} className="mt-4" />}
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {langs.map((l) => (
                      <span key={l} className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">{l}</span>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {r.file_count ? `${r.file_count} files · ` : ""}Updated {formatRelative(r.updated_at)}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
