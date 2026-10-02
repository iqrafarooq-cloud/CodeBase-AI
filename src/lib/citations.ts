import type { SourceReference } from "@/lib/types";

export function formatCitation(ref: Pick<SourceReference, "path" | "startLine" | "endLine">) {
  if (!ref.startLine) return ref.path;
  return ref.startLine === ref.endLine ? `${ref.path}:L${ref.startLine}` : `${ref.path}:L${ref.startLine}-L${ref.endLine}`;
}

export function explorerHref(repositoryId: string, ref: Pick<SourceReference, "path" | "startLine" | "endLine">) {
  const params = new URLSearchParams({ path: ref.path });
  if (ref.startLine) params.set("lines", `${ref.startLine}-${ref.endLine || ref.startLine}`);
  return `/repositories/${repositoryId}/explorer?${params.toString()}`;
}

/** Parses "12-40" or "12" into a validated line range. */
export function parseLineRange(value: string | null | undefined): { start: number; end: number } | null {
  if (!value) return null;
  const m = /^(\d{1,6})(?:-(\d{1,6}))?$/.exec(value);
  if (!m) return null;
  const start = Number(m[1]);
  const end = m[2] ? Number(m[2]) : start;
  if (start < 1 || end < start) return null;
  return { start, end };
}

/**
 * Deduplicates references and merges overlapping/adjacent ranges in the same file,
 * keeping the excerpt of the first reference. Order of first appearance is preserved.
 */
export function mergeSources(refs: SourceReference[], limit = 12): SourceReference[] {
  const byPath = new Map<string, SourceReference[]>();
  const order: string[] = [];
  for (const r of refs) {
    if (!r?.path || typeof r.startLine !== "number") continue;
    if (!byPath.has(r.path)) {
      byPath.set(r.path, []);
      order.push(r.path);
    }
    const list = byPath.get(r.path)!;
    const overlap = list.find((x) => r.startLine <= x.endLine + 1 && r.endLine >= x.startLine - 1);
    if (overlap) {
      overlap.startLine = Math.min(overlap.startLine, r.startLine);
      overlap.endLine = Math.max(overlap.endLine, r.endLine);
      overlap.symbol = overlap.symbol ?? r.symbol;
    } else list.push({ ...r });
  }
  return order.flatMap((p) => byPath.get(p)!.sort((a, b) => a.startLine - b.startLine)).slice(0, limit);
}

type PartLike = { type: string; state?: string; output?: unknown };

/** Collects the evidence returned by agent tools in a UI message. Only real tool outputs count. */
export function extractSources(parts: PartLike[]): SourceReference[] {
  const refs: SourceReference[] = [];
  for (const p of parts) {
    if (!p.type.startsWith("tool-") || p.state !== "output-available") continue;
    const out = p.output as { sources?: SourceReference[] } | undefined;
    if (out && Array.isArray(out.sources)) refs.push(...out.sources);
  }
  return mergeSources(refs);
}
