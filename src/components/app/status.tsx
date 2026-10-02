import { AlertTriangle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { AnalysisStatus } from "@/lib/types";

const META: Record<AnalysisStatus, { label: string; variant: "default" | "primary" | "success" | "destructive"; dot: string }> = {
  pending: { label: "Pending", variant: "default", dot: "bg-muted-foreground" },
  processing: { label: "Processing", variant: "primary", dot: "bg-primary animate-pulse" },
  completed: { label: "Completed", variant: "success", dot: "bg-success" },
  failed: { label: "Failed", variant: "destructive", dot: "bg-destructive" },
};

export function StatusBadge({ status }: { status: AnalysisStatus }) {
  const m = META[status];
  const Icon = status === "completed" ? CheckCircle2 : status === "failed" ? AlertTriangle : status === "processing" ? Loader2 : Clock;
  return (
    <Badge variant={m.variant}>
      <Icon className={cn(status === "processing" && "animate-spin")} />
      {m.label}
    </Badge>
  );
}

export function StatusDot({ status }: { status: AnalysisStatus }) {
  return <span className={cn("size-2 shrink-0 rounded-full", META[status].dot)} aria-label={META[status].label} />;
}
