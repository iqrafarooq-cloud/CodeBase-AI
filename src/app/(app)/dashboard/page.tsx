import Link from "next/link";
import { ArrowRight, BookOpenCheck, FileCode2, FolderGit2, Languages, MessagesSquare, Network, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, EmptyState, Progress } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/app/status";
import { getShellData } from "@/lib/data";
import { CODE_LANGUAGES, displayLanguage } from "@/lib/repo/languages";
import { formatRelative } from "@/lib/utils";

export const metadata = { title: "Overview" };

export default async function DashboardPage() {
  const { supabase, user, profile, repositories } = await getShellData();
  const { data: tasks } = await supabase
    .from("onboarding_tasks")
    .select("status, onboarding_roadmaps!inner(user_id, repository_id)")
    .eq("onboarding_roadmaps.user_id", user.id);

  const totalTasks = tasks?.length ?? 0;
  const doneTasks = tasks?.filter((t) => t.status === "done").length ?? 0;
  const progress = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const analyzedFiles = repositories.reduce((n, r) => n + (r.file_count ?? 0), 0);
  const languages = new Set<string>();
  for (const r of repositories) for (const l of Object.keys(r.languages ?? {})) if (CODE_LANGUAGES.has(l)) languages.add(displayLanguage(l));
  const completed = repositories.filter((r) => r.analysis_status === "completed");
  const primary = completed[0];

  const stats = [
    { label: "Connected repositories", value: repositories.length, icon: FolderGit2 },
    { label: "Analyzed files", value: analyzedFiles.toLocaleString(), icon: FileCode2 },
    { label: "Languages", value: languages.size, icon: Languages, hint: [...languages].slice(0, 4).join(", ") },
    { label: "Onboarding progress", value: totalTasks ? `${progress}%` : "-", icon: BookOpenCheck, hint: totalTasks ? `${doneTasks}/${totalTasks} tasks` : "No roadmap yet" },
  ];

  const nextActions: { label: string; href: string; icon: typeof Plus }[] = [];
  if (!repositories.length) nextActions.push({ label: "Connect your first repository", href: "/repositories/new", icon: Plus });
  if (primary) {
    nextActions.push({ label: `Ask "Explain this project to me" about ${primary.name}`, href: `/repositories/${primary.id}/chat?q=${encodeURIComponent("Explain this project to me.")}`, icon: MessagesSquare });
    if (!totalTasks) nextActions.push({ label: `Generate your onboarding roadmap for ${primary.name}`, href: `/repositories/${primary.id}/roadmap`, icon: BookOpenCheck });
    nextActions.push({ label: `Explore the architecture of ${primary.name}`, href: `/repositories/${primary.id}/architecture`, icon: Network });
  }
  if (totalTasks && doneTasks < totalTasks && primary) nextActions.unshift({ label: `Continue your roadmap (${totalTasks - doneTasks} tasks left)`, href: `/repositories/${primary.id}/roadmap`, icon: BookOpenCheck });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Welcome back, {profile?.display_name ?? "developer"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pick up where you left off, or connect a new codebase to explore.</p>
        </div>
        <Button asChild>
          <Link href="/repositories/new">
            <Plus /> Connect repository
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs">{s.label}</span>
              <s.icon className="size-4" />
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{s.value}</p>
            {s.hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{s.hint}</p>}
            {s.label === "Onboarding progress" && totalTasks > 0 && <Progress value={progress} className="mt-2" />}
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent repository activity</CardTitle>
            <Link href="/repositories" className="text-xs text-muted-foreground hover:text-foreground">View all</Link>
          </CardHeader>
          <CardContent>
            {repositories.length === 0 ? (
              <EmptyState
                icon={FolderGit2}
                title="No repositories connected"
                description="Connect a public GitHub repository or upload a ZIP to get started."
                action={
                  <Button asChild size="sm">
                    <Link href="/repositories/new"><Plus /> Connect repository</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-border">
                {repositories.slice(0, 6).map((r) => (
                  <li key={r.id}>
                    <Link href={`/repositories/${r.id}`} className="flex items-center gap-3 py-3 hover:opacity-90">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                        <FolderGit2 className="size-4 text-muted-foreground" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{r.owner ? `${r.owner}/${r.name}` : r.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {r.file_count ? `${r.file_count} files · ` : ""}updated {formatRelative(r.updated_at)}
                        </span>
                      </span>
                      <StatusBadge status={r.analysis_status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-primary/15 blur-3xl" />
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /> AI codebase assistant</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Ask questions about real source code and get answers with file and line citations.</p>
              <Button className="mt-4" variant="secondary" asChild disabled={!primary}>
                <Link href={primary ? `/repositories/${primary.id}/chat` : "/repositories/new"}>
                  {primary ? "Open chat" : "Connect a repository first"} <ArrowRight />
                </Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Suggested next actions</CardTitle>
            </CardHeader>
            <CardContent>
              {nextActions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Your repositories are still being analyzed. Check back in a moment.</p>
              ) : (
                <ul className="space-y-1">
                  {nextActions.slice(0, 4).map((a) => (
                    <li key={a.label}>
                      <Link href={a.href} className="flex items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-muted">
                        <a.icon className="size-4 shrink-0 text-primary" />
                        <span className="flex-1">{a.label}</span>
                        <ArrowRight className="size-3.5 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
