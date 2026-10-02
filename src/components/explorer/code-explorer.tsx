"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, FileCode2, Folder, FolderOpen, Hash, Loader2, MessagesSquare, Search, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState, Input } from "@/components/ui/primitives";
import { CopyButton } from "@/components/code/code-block";
import { highlight } from "@/components/code/highlight";
import { parseLineRange } from "@/lib/citations";
import { cn, formatBytes } from "@/lib/utils";

export type ExplorerFile = {
  path: string;
  language: string;
  size: number;
  lines: number;
  symbols: { name: string; kind: string; line: number }[];
};

type FileContent = { file_path: string; language: string; file_size: number; line_count: number; content: string | null; parse_error: string | null };

type TreeNode = { name: string; path: string; children: Map<string, TreeNode>; file?: ExplorerFile };

const HIGHLIGHT_MAX_CHARS = 150_000;
const PLAIN_MAX_LINES = 5000;

function buildTree(files: ExplorerFile[]): TreeNode {
  const root: TreeNode = { name: "", path: "", children: new Map() };
  for (const f of files) {
    let node = root;
    const parts = f.path.split("/");
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join("/");
      if (!node.children.has(part)) node.children.set(part, { name: part, path, children: new Map() });
      node = node.children.get(part)!;
      if (i === parts.length - 1) node.file = f;
    });
  }
  return root;
}

function sortedChildren(n: TreeNode) {
  return [...n.children.values()].sort((a, b) => (a.file ? 1 : 0) - (b.file ? 1 : 0) || a.name.localeCompare(b.name));
}

export function CodeExplorer({ repositoryId, files, initialPath, initialLines }: { repositoryId: string; files: ExplorerFile[]; initialPath: string | null; initialLines: string | null }) {
  const tree = useMemo(() => buildTree(files), [files]);
  const firstFile = files.find((f) => /^readme/i.test(f.path)) ?? files[0];
  const [selected, setSelected] = useState<string | null>(initialPath && files.some((f) => f.path === initialPath) ? initialPath : firstFile?.path ?? null);
  const [range, setRange] = useState(parseLineRange(initialLines));
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    const p = (initialPath ?? firstFile?.path ?? "").split("/");
    for (let i = 1; i < p.length; i++) s.add(p.slice(0, i).join("/"));
    return s;
  });

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return null;
    const pathHits = files.filter((f) => f.path.toLowerCase().includes(q)).slice(0, 50).map((f) => ({ path: f.path, symbol: null as null | { name: string; kind: string; line: number } }));
    const symbolHits = files
      .flatMap((f) => f.symbols.filter((s) => s.name.toLowerCase().includes(q)).map((s) => ({ path: f.path, symbol: s })))
      .slice(0, 50);
    return [...symbolHits, ...pathHits];
  }, [files, query]);

  function open(path: string, lines?: { start: number; end: number } | null) {
    setSelected(path);
    setRange(lines ?? null);
    const params = new URLSearchParams({ path });
    if (lines) params.set("lines", `${lines.start}-${lines.end}`);
    window.history.replaceState(null, "", `?${params.toString()}`);
    setExpanded((prev) => {
      const next = new Set(prev);
      const parts = path.split("/");
      for (let i = 1; i < parts.length; i++) next.add(parts.slice(0, i).join("/"));
      return next;
    });
  }

  if (files.length === 0) return <EmptyState icon={FileCode2} title="No files indexed" description="This repository has no indexed files." />;
  const meta = files.find((f) => f.path === selected) ?? null;

  return (
    <div className="flex h-[calc(100dvh-13rem)] min-h-[480px] flex-col overflow-hidden rounded-xl border border-border bg-card md:flex-row">
      <aside className="flex max-h-72 w-full shrink-0 flex-col border-b border-border md:max-h-none md:w-72 md:border-b-0 md:border-r">
        <div className="relative border-b border-border p-2">
          <Search className="absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search files and symbols" className="h-8 pl-7 text-xs" aria-label="Search files and symbols" />
        </div>
        <div className="flex-1 overflow-auto py-1 text-[13px]">
          {results ? (
            results.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground">No matches</p>
            ) : (
              <ul>
                {results.map((r, i) => (
                  <li key={`${r.path}-${r.symbol?.name ?? ""}-${i}`}>
                    <button
                      onClick={() => open(r.path, r.symbol ? { start: r.symbol.line, end: r.symbol.line } : null)}
                      className="flex w-full items-center gap-1.5 px-3 py-1 text-left hover:bg-muted"
                    >
                      {r.symbol ? <Hash className="size-3.5 shrink-0 text-violet" /> : <FileCode2 className="size-3.5 shrink-0 text-muted-foreground" />}
                      <span className="min-w-0 flex-1 truncate">
                        {r.symbol ? <><span className="font-medium">{r.symbol.name}</span> <span className="text-muted-foreground">{r.path}</span></> : r.path}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <Tree node={tree} depth={0} expanded={expanded} toggle={(p) => setExpanded((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; })} selected={selected} onSelect={(p) => open(p)} />
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {selected && meta ? (
          <FileViewer key={selected} repositoryId={repositoryId} meta={meta} range={range} onSymbol={(line) => open(selected, { start: line, end: line })} />
        ) : (
          <EmptyState icon={FileCode2} title="Select a file" description="Choose a file from the tree to view its source." className="m-6" />
        )}
      </section>
    </div>
  );
}

function Tree({ node, depth, expanded, toggle, selected, onSelect }: { node: TreeNode; depth: number; expanded: Set<string>; toggle: (p: string) => void; selected: string | null; onSelect: (p: string) => void }) {
  return (
    <ul role={depth === 0 ? "tree" : "group"}>
      {sortedChildren(node).map((c) => {
        const isOpen = expanded.has(c.path);
        return (
          <li key={c.path} role="treeitem" aria-expanded={c.file ? undefined : isOpen} aria-selected={c.path === selected}>
            <button
              onClick={() => (c.file ? onSelect(c.path) : toggle(c.path))}
              className={cn("flex w-full items-center gap-1.5 py-1 pr-2 text-left hover:bg-muted", c.path === selected && "bg-accent text-accent-foreground")}
              style={{ paddingLeft: 8 + depth * 12 }}
              title={c.path}
            >
              {c.file ? (
                <FileCode2 className="ml-[18px] size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <>
                  <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
                  {isOpen ? <FolderOpen className="size-3.5 shrink-0 text-primary/80" /> : <Folder className="size-3.5 shrink-0 text-primary/80" />}
                </>
              )}
              <span className="truncate">{c.name}</span>
            </button>
            {!c.file && isOpen && <Tree node={c} depth={depth + 1} expanded={expanded} toggle={toggle} selected={selected} onSelect={onSelect} />}
          </li>
        );
      })}
    </ul>
  );
}

function FileViewer({ repositoryId, meta, range, onSymbol }: { repositoryId: string; meta: ExplorerFile; range: { start: number; end: number } | null; onSymbol: (line: number) => void }) {
  const [file, setFile] = useState<FileContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/repositories/${repositoryId}/file?path=${encodeURIComponent(meta.path)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error?.message ?? "Could not load file.");
        return res.json() as Promise<FileContent>;
      })
      .then((f) => alive && setFile(f))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Could not load file."));
    return () => {
      alive = false;
    };
  }, [repositoryId, meta.path]);

  const highlightable = !!file?.content && file.content.length <= HIGHLIGHT_MAX_CHARS;
  useEffect(() => {
    if (!file?.content || !highlightable) return;
    let alive = true;
    highlight(file.content, file.language, { highlightLines: range })
      .then((h) => alive && setHtml(h))
      .catch(() => alive && setHtml(null));
    return () => {
      alive = false;
    };
  }, [file, highlightable, range]);

  useEffect(() => {
    if (!range || !body.current) return;
    const el = body.current.querySelector(`[data-line="${range.start}"]`);
    el?.scrollIntoView({ block: "center" });
  }, [html, range]);

  const plainLines = useMemo(() => (file?.content && !highlightable ? file.content.split("\n").slice(0, PLAIN_MAX_LINES) : null), [file, highlightable]);
  const outline = meta.symbols.filter((s) => s.kind !== "variable" || meta.symbols.length < 30).slice(0, 200);

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{meta.path}</span>
        <span className="text-[11px] text-muted-foreground">{meta.language} · {meta.lines} lines · {formatBytes(meta.size)}</span>
        {file?.content && <CopyButton text={file.content} />}
        <Button size="sm" variant="ghost" className="h-7 text-xs" asChild>
          <Link href={`/repositories/${repositoryId}/chat?q=${encodeURIComponent(`Explain the file ${meta.path}`)}`}>
            <MessagesSquare /> Explain
          </Link>
        </Button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div ref={body} className="min-w-0 flex-1 overflow-auto bg-code" data-testid="code-viewer">
          {error ? (
            <p className="flex items-center gap-2 p-4 text-sm text-destructive"><TriangleAlert className="size-4" /> {error}</p>
          ) : !file ? (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</div>
          ) : file.content === null ? (
            <p className="p-4 text-sm text-muted-foreground">This file is too large to display.</p>
          ) : html ? (
            <div className="shiki-host numbered" dangerouslySetInnerHTML={{ __html: html }} />
          ) : plainLines ? (
            <>
              <p className="border-b border-border bg-warning/10 px-4 py-1.5 text-xs text-warning">Large file: syntax highlighting disabled{file.content.split("\n").length > PLAIN_MAX_LINES ? `, showing first ${PLAIN_MAX_LINES} lines` : ""}.</p>
              <pre className="py-3 font-mono text-[12.5px] leading-relaxed">
                {plainLines.map((l, i) => (
                  <div key={i} data-line={i + 1} className={cn("flex", range && i + 1 >= range.start && i + 1 <= range.end && "bg-primary/15")}>
                    <span className="w-14 shrink-0 select-none pr-4 text-right text-muted-foreground/60">{i + 1}</span>
                    <span className="whitespace-pre pr-4">{l}</span>
                  </div>
                ))}
              </pre>
            </>
          ) : (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Highlighting…</div>
          )}
        </div>
        {outline.length > 0 && (
          <nav className="hidden w-52 shrink-0 overflow-y-auto border-l border-border py-2 xl:block" aria-label="Symbols">
            <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Symbols</p>
            {outline.map((s, i) => (
              <button key={`${s.name}-${i}`} onClick={() => onSymbol(s.line)} className="flex w-full items-center gap-1.5 px-3 py-1 text-left text-xs hover:bg-muted">
                <span className="w-9 shrink-0 text-[10px] text-violet">{s.kind.slice(0, 5)}</span>
                <span className="truncate">{s.name}</span>
              </button>
            ))}
          </nav>
        )}
      </div>
    </>
  );
}
