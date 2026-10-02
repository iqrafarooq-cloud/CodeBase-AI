"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpenCheck, CheckCircle2, ChevronDown, Circle, Clock, FileCode2, Loader2, MessagesSquare, RefreshCw, Sparkles, Target } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, Progress } from "@/components/ui/primitives";
import { explorerHref } from "@/lib/citations";
import { cn, formatRelative } from "@/lib/utils";

export type RoadmapTask = {
  id: string;
  title: string;
  description: string;
  why_it_matters: string | null;
  relevant_files: string[];
  suggested_questions: string[];
  estimated_minutes: number;
  status: "todo" | "done";
  sort_order: number;
};

type Roadmap = {
  id: string;
  title: string;
  summary: string | null;
  generatedBy: "ai" | "deterministic";
  experienceLevel: string | null;
  role: string | null;
  goal: string | null;
  createdAt: string;
};

function duration(min: number) {
  return min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ""}` : `${min}m`;
}

export function RoadmapClient({ repositoryId, roadmap, tasks: initialTasks }: { repositoryId: string; roadmap: Roadmap | null; tasks: RoadmapTask[] }) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [generating, setGenerating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(initialTasks.find((t) => t.status === "todo")?.id ?? null);

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/repositories/${repositoryId}/roadmap`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Roadmap generation failed.");
      }
      toast.success(roadmap ? "Roadmap regenerated." : "Roadmap created.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Roadmap generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  async function toggle(task: RoadmapTask) {
    const status = task.status === "done" ? "todo" : "done";
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, status } : t)));
    const res = await fetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    if (!res.ok) {
      setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)));
      toast.error("Could not update the task.");
      return;
    }
    if (status === "done") {
      const next = tasks.find((t) => t.id !== task.id && t.status === "todo");
      setOpenId(next?.id ?? null);
    }
  }

  if (!roadmap) {
    return (
      <EmptyState
        icon={BookOpenCheck}
        title="No onboarding roadmap yet"
        description="Generate an ordered learning plan based on this repository's structure and your experience, role and goals."
        action={
          <Button onClick={generate} disabled={generating}>
            {generating ? <Loader2 className="animate-spin" /> : <Sparkles />} Generate my roadmap
          </Button>
        }
      />
    );
  }

  const done = tasks.filter((t) => t.status === "done").length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const remaining = tasks.filter((t) => t.status === "todo").reduce((n, t) => n + t.estimated_minutes, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        {tasks.map((t, i) => {
          const open = openId === t.id;
          const isDone = t.status === "done";
          return (
            <motion.div key={t.id} layout transition={{ duration: 0.15 }}>
              <Card className={cn("overflow-hidden transition-colors", isDone && "opacity-75")} data-testid="roadmap-task">
                <div className="flex items-start gap-3 p-4">
                  <button
                    onClick={() => toggle(t)}
                    className="mt-0.5 shrink-0 rounded-full text-muted-foreground hover:text-success"
                    aria-label={isDone ? `Reopen task: ${t.title}` : `Mark task complete: ${t.title}`}
                    data-testid="task-toggle"
                  >
                    {isDone ? <CheckCircle2 className="size-5 text-success" /> : <Circle className="size-5" />}
                  </button>
                  <button className="min-w-0 flex-1 text-left" onClick={() => setOpenId(open ? null : t.id)} aria-expanded={open}>
                    <p className="text-xs text-muted-foreground">Step {i + 1}</p>
                    <p className={cn("font-medium", isDone && "line-through decoration-muted-foreground/60")}>{t.title}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock className="size-3" /> {duration(t.estimated_minutes)}</p>
                  </button>
                  <ChevronDown className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
                </div>
                {open && (
                  <div className="space-y-4 border-t border-border px-4 py-4 pl-12 text-sm">
                    <p>{t.description}</p>
                    {t.why_it_matters && (
                      <p className="flex gap-2 text-muted-foreground"><Target className="mt-0.5 size-4 shrink-0 text-primary" /> {t.why_it_matters}</p>
                    )}
                    {t.relevant_files.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Relevant files</p>
                        <ul className="space-y-1">
                          {t.relevant_files.map((f) => (
                            <li key={f}>
                              <Link href={explorerHref(repositoryId, { path: f, startLine: 0, endLine: 0 })} className="inline-flex items-center gap-1.5 font-mono text-xs text-primary hover:underline">
                                <FileCode2 className="size-3.5" /> {f}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div>
                      <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Ask the assistant</p>
                      <div className="flex flex-wrap gap-2">
                        {[...t.suggested_questions, `Help me with this onboarding task: "${t.title}". ${t.description}`].slice(0, 4).map((q, qi) => (
                          <Button key={qi} size="sm" variant="outline" className="h-auto max-w-full whitespace-normal py-1.5 text-left" asChild>
                            <Link href={`/repositories/${repositoryId}/chat?q=${encodeURIComponent(q)}`}>
                              <MessagesSquare className="shrink-0" /> {qi === t.suggested_questions.length || qi === 3 ? "Ask about this task" : q}
                            </Link>
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            </motion.div>
          );
        })}
      </div>

      <div className="space-y-4">
        <Card className="p-5">
          <p className="text-sm font-semibold">{roadmap.title}</p>
          {roadmap.summary && <p className="mt-1 text-xs text-muted-foreground">{roadmap.summary}</p>}
          <div className="mt-5 flex items-end justify-between">
            <span className="text-3xl font-semibold tabular-nums">{pct}%</span>
            <span className="text-xs text-muted-foreground">{done}/{tasks.length} tasks</span>
          </div>
          <Progress value={pct} className="mt-2" />
          <p className="mt-2 text-xs text-muted-foreground">{remaining > 0 ? `About ${duration(remaining)} remaining` : "All tasks complete - nice work!"}</p>
        </Card>
        <Card className="space-y-3 p-5 text-sm">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant={roadmap.generatedBy === "ai" ? "violet" : "success"}>{roadmap.generatedBy === "ai" ? "AI-personalized" : "From static analysis"}</Badge>
            {roadmap.experienceLevel && <Badge>{roadmap.experienceLevel}</Badge>}
            {roadmap.role && <Badge>{roadmap.role}</Badge>}
          </div>
          {roadmap.goal && <p className="text-xs text-muted-foreground">Goal: {roadmap.goal}</p>}
          <p className="text-xs text-muted-foreground">Created {formatRelative(roadmap.createdAt)}</p>
          <Button variant="outline" size="sm" onClick={generate} disabled={generating} className="w-full">
            {generating ? <Loader2 className="animate-spin" /> : <RefreshCw />} Regenerate roadmap
          </Button>
          <p className="text-[11px] text-muted-foreground">Regenerating replaces this plan and resets progress. Update your goals in Settings first to personalize it.</p>
        </Card>
      </div>
    </div>
  );
}
