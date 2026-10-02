"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, ExternalLink, FileCode2 } from "lucide-react";
import { explorerHref, formatCitation } from "@/lib/citations";
import type { SourceReference } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Expandable, verifiable evidence: every entry comes from a tool result, never from model text. */
export function SourceList({ sources, repositoryId }: { sources: SourceReference[]; repositoryId: string }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  if (!sources.length) return null;
  return (
    <div className="mt-3 rounded-lg border border-border" data-testid="sources">
      <button className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        {sources.length} source reference{sources.length === 1 ? "" : "s"}
      </button>
      {open && (
        <ul className="divide-y divide-border border-t border-border">
          {sources.map((s, i) => (
            <li key={`${s.path}-${s.startLine}-${i}`} className="px-3 py-2">
              <div className="flex items-center gap-2">
                <FileCode2 className="size-3.5 shrink-0 text-muted-foreground" />
                <button className="min-w-0 flex-1 truncate text-left font-mono text-xs hover:underline" onClick={() => setExpanded(expanded === i ? null : i)} title="Show excerpt">
                  {formatCitation(s)}
                  {s.symbol && <span className="ml-2 text-muted-foreground">{s.symbol}</span>}
                </button>
                <Link href={explorerHref(repositoryId, s)} className="flex shrink-0 items-center gap-1 text-[11px] text-primary hover:underline" data-testid="open-in-explorer">
                  Open <ExternalLink className="size-3" />
                </Link>
              </div>
              {expanded === i && s.excerpt && (
                <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-code p-2 font-mono text-[11.5px] leading-relaxed text-muted-foreground">{s.excerpt}</pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
