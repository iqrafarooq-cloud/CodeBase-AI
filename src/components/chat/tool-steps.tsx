"use client";

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

const LABELS: Record<string, string> = {
  search_code: "Searched code",
  explain_file: "Read file",
  trace_workflow: "Traced workflow",
  analyze_repository: "Loaded repository analysis",
  generate_architecture: "Loaded architecture graph",
  generate_onboarding_roadmap: "Generated onboarding roadmap",
  find_entry_points: "Located entry points",
};

function detail(name: string, input?: Record<string, unknown>) {
  if (!input) return "";
  const v = input.query ?? input.path ?? input.feature ?? input.aspect ?? input.focus;
  return typeof v === "string" ? v : "";
}

/** Transparent record of which tools the agent actually ran for this answer. */
export function ToolSteps({ parts, savedTools }: { parts: { type: string; state: string; input?: Record<string, unknown> }[]; savedTools?: string[] }) {
  const steps = parts.length
    ? parts.map((p) => ({ name: p.type.slice(5), state: p.state, input: p.input }))
    : (savedTools ?? []).map((name) => ({ name, state: "output-available", input: undefined }));
  if (!steps.length) return null;
  return (
    <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="Agent tool calls">
      {steps.map((s, i) => {
        const d = detail(s.name, s.input);
        const running = s.state === "input-streaming" || s.state === "input-available";
        const failed = s.state === "output-error";
        return (
          <li key={i} className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground">
            {running ? <Loader2 className="size-3 animate-spin text-primary" /> : failed ? <AlertCircle className="size-3 text-destructive" /> : <CheckCircle2 className="size-3 text-success" />}
            <span>{LABELS[s.name] ?? s.name}</span>
            {d && <span className="truncate font-mono text-foreground/80">{d.slice(0, 60)}</span>}
          </li>
        );
      })}
    </ul>
  );
}
