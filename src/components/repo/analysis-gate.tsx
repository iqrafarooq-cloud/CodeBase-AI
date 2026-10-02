"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Clock, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, Progress } from "@/components/ui/primitives";
import type { AnalysisStatus } from "@/lib/types";
import { startAnalysis } from "./repo-actions";

type Status = { status: AnalysisStatus; progress: number; message: string | null; error: string | null };

/**
 * Shown instead of repository features until analysis has completed. Polls the status
 * endpoint and refreshes the page when the analysis finishes.
 */
export function AnalysisGate({ id, initial }: { id: string; initial: Status }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (s.status !== "processing" && s.status !== "pending") return;
    let cancelled = false;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/repositories/${id}`, { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as Status;
        if (cancelled) return;
        setS(next);
        if (next.status === "completed" || next.status === "failed") {
          clearInterval(t);
          router.refresh();
        }
      } catch {
        // transient network errors: keep polling
      }
    }, 2500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [id, s.status, router]);

  async function retry() {
    setRetrying(true);
    try {
      await startAnalysis(id, true);
      setS({ status: "processing", progress: 1, message: "Queued", error: null });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not restart analysis.");
    } finally {
      setRetrying(false);
    }
  }

  if (s.status === "failed") {
    return (
      <Card className="mx-auto max-w-xl p-6 text-center">
        <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-lg bg-destructive/10">
          <AlertTriangle className="size-5 text-destructive" />
        </div>
        <h2 className="font-semibold">Analysis failed</h2>
        <p className="mt-1 text-sm text-muted-foreground">{s.error ?? "Something went wrong while analyzing this repository."}</p>
        <Button className="mt-5" onClick={retry} disabled={retrying}>
          {retrying ? <Loader2 className="animate-spin" /> : <RefreshCw />} Retry analysis
        </Button>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-xl p-6" data-testid="analysis-progress">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
          {s.status === "pending" ? <Clock className="size-5 text-primary" /> : <Loader2 className="size-5 animate-spin text-primary" />}
        </div>
        <div>
          <h2 className="font-semibold">{s.status === "pending" ? "Waiting to start" : "Analyzing repository"}</h2>
          <p className="text-sm text-muted-foreground">{s.message ?? "Preparing…"}</p>
        </div>
      </div>
      <Progress value={s.progress} className="mt-5" />
      <p className="mt-2 text-right text-xs tabular-nums text-muted-foreground">{s.progress}%</p>
      {s.status === "pending" && (
        <Button variant="outline" size="sm" className="mt-2" onClick={retry} disabled={retrying}>
          Start analysis
        </Button>
      )}
    </Card>
  );
}
