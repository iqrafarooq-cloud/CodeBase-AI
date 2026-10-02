import type { SymbolInfo } from "@/lib/types";

export type Chunk = {
  symbolName: string | null;
  symbolKind: string | null;
  content: string;
  startLine: number; // 1-based, inclusive
  endLine: number; // 1-based, inclusive
};

export const MAX_CHUNK_LINES = 120;
const WINDOW_OVERLAP = 12;
const MAX_CHUNK_CHARS = 6000;

/**
 * Syntax-aware chunking: top-level symbols become their own chunks (split only when they are
 * longer than MAX_CHUNK_LINES), code between symbols is grouped into "module" chunks.
 * Files without symbol data fall back to heading-based (Markdown) or line-window chunking.
 */
export function chunkFile(input: { path: string; language: string; content: string; symbols: SymbolInfo[] }): Chunk[] {
  const lines = input.content.split("\n");
  if (!input.content.trim()) return [];
  const topLevel = input.symbols
    .filter((s) => s.kind !== "method")
    .sort((a, b) => a.line - b.line)
    // drop symbols nested inside an earlier one (defensive)
    .filter((s, i, arr) => i === 0 || s.line > arr[i - 1].endLine);

  if (topLevel.length > 0) return chunkBySymbols(lines, topLevel);
  if (input.language === "markdown") return chunkMarkdown(lines);
  return windows(lines, 1, lines.length, null, null);
}

function chunkBySymbols(lines: string[], symbols: SymbolInfo[]): Chunk[] {
  const chunks: Chunk[] = [];
  let cursor = 1;
  for (const s of symbols) {
    if (s.line > cursor) chunks.push(...gap(lines, cursor, s.line - 1));
    const end = Math.min(s.endLine, lines.length);
    chunks.push(...windows(lines, s.line, end, s.name, s.kind));
    cursor = end + 1;
  }
  if (cursor <= lines.length) chunks.push(...gap(lines, cursor, lines.length));
  return chunks;
}

/** Non-symbol code (imports, top-level statements). Skipped if it is only whitespace. */
function gap(lines: string[], start: number, end: number): Chunk[] {
  const text = lines.slice(start - 1, end).join("\n");
  if (!text.trim()) return [];
  // Trim blank edges so line ranges are tight.
  while (start < end && !lines[start - 1].trim()) start++;
  while (end > start && !lines[end - 1].trim()) end--;
  return windows(lines, start, end, null, null);
}

function windows(lines: string[], start: number, end: number, symbol: string | null, kind: string | null): Chunk[] {
  const out: Chunk[] = [];
  const total = end - start + 1;
  if (total <= MAX_CHUNK_LINES) {
    out.push(make(lines, start, end, symbol, kind));
    return out;
  }
  let part = 1;
  for (let s = start; s <= end; s += MAX_CHUNK_LINES - WINDOW_OVERLAP) {
    const e = Math.min(end, s + MAX_CHUNK_LINES - 1);
    out.push(make(lines, s, e, symbol ? `${symbol} (part ${part})` : null, kind));
    part++;
    if (e === end) break;
  }
  return out;
}

function make(lines: string[], start: number, end: number, symbol: string | null, kind: string | null): Chunk {
  let content = lines.slice(start - 1, end).join("\n");
  if (content.length > MAX_CHUNK_CHARS) content = content.slice(0, MAX_CHUNK_CHARS) + "\n…";
  return { symbolName: symbol, symbolKind: kind, content, startLine: start, endLine: end };
}

function chunkMarkdown(lines: string[]): Chunk[] {
  const chunks: Chunk[] = [];
  let start = 1;
  let heading: string | null = null;
  let inFence = false;
  const flush = (end: number) => {
    if (end >= start && lines.slice(start - 1, end).join("").trim()) chunks.push(...windows(lines, start, end, heading, heading ? "section" : null));
  };
  lines.forEach((l, i) => {
    if (/^```/.test(l)) inFence = !inFence;
    const m = !inFence && /^(#{1,3})\s+(.+)/.exec(l);
    if (m && i > 0) {
      flush(i);
      start = i + 1;
    }
    if (m) heading = m[2].trim().slice(0, 120);
  });
  flush(lines.length);
  return chunks;
}

/** Text that is embedded for a chunk: a short header gives the model path/symbol context. */
export function embeddingText(path: string, chunk: Pick<Chunk, "symbolName" | "content">) {
  return `File: ${path}\n${chunk.symbolName ? `Symbol: ${chunk.symbolName}\n` : ""}\n${chunk.content}`.slice(0, 8000);
}
