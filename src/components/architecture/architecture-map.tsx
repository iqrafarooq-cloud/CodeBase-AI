"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { Boxes, Cloud, Database, FlaskConical, Globe, KeyRound, LayoutTemplate, Server, Settings2, X } from "lucide-react";
import { useTheme } from "next-themes";
import { explorerHref } from "@/lib/citations";
import type { ArchEdge, ArchNode, ArchNodeKind, ArchitectureData } from "@/lib/types";
import { cn } from "@/lib/utils";

const KIND_STYLE: Record<ArchNodeKind, { icon: typeof Boxes; color: string; column: number; label: string }> = {
  frontend: { icon: LayoutTemplate, color: "var(--cyan)", column: 0, label: "Frontend" },
  auth: { icon: KeyRound, color: "var(--warning)", column: 1, label: "Authentication" },
  api: { icon: Globe, color: "var(--primary)", column: 1, label: "API routes" },
  backend: { icon: Server, color: "var(--violet)", column: 2, label: "Backend / services" },
  module: { icon: Boxes, color: "var(--muted-foreground)", column: 2, label: "Module" },
  database: { icon: Database, color: "var(--success)", column: 3, label: "Database" },
  external: { icon: Cloud, color: "var(--destructive)", column: 4, label: "External service" },
  tests: { icon: FlaskConical, color: "var(--muted-foreground)", column: 3, label: "Tests" },
  config: { icon: Settings2, color: "var(--muted-foreground)", column: 4, label: "Config" },
};

type ArchNodeData = { node: ArchNode; selected: boolean; dimmed: boolean };

function ArchNodeView({ data }: NodeProps<Node<ArchNodeData>>) {
  const s = KIND_STYLE[data.node.kind];
  const Icon = s.icon;
  return (
    <div
      className={cn(
        "w-52 rounded-lg border bg-card px-3 py-2.5 shadow-sm transition-all",
        data.selected ? "border-primary ring-2 ring-primary/30" : "border-border",
        data.dimmed && "opacity-35",
      )}
      style={{ borderLeft: `3px solid ${s.color}` }}
    >
      <Handle type="target" position={Position.Left} className="!size-2 !border-0 !bg-muted-foreground/50" />
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0" style={{ color: s.color }} />
        <span className="truncate text-sm font-medium">{data.node.label}</span>
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {data.node.kind === "external" ? "External dependency" : `${data.node.files.length} file${data.node.files.length === 1 ? "" : "s"}`}
      </p>
      <Handle type="source" position={Position.Right} className="!size-2 !border-0 !bg-muted-foreground/50" />
    </div>
  );
}

const nodeTypes = { arch: ArchNodeView };

function layout(nodes: ArchNode[]) {
  const columns = new Map<number, ArchNode[]>();
  for (const n of nodes) {
    const c = KIND_STYLE[n.kind].column;
    columns.set(c, [...(columns.get(c) ?? []), n]);
  }
  const pos = new Map<string, { x: number; y: number }>();
  for (const [col, list] of columns) {
    list.sort((a, b) => b.files.length - a.files.length);
    const total = list.length * 96;
    list.forEach((n, i) => pos.set(n.id, { x: col * 290, y: i * 96 - total / 2 }));
  }
  return pos;
}

export function ArchitectureMap({ repositoryId, data }: { repositoryId: string; data: ArchitectureData }) {
  const { resolvedTheme } = useTheme();
  const [selected, setSelected] = useState<string | null>(null);
  const [showInferred, setShowInferred] = useState(true);
  const positions = useMemo(() => layout(data.nodes), [data.nodes]);

  const visibleEdges = data.edges.filter((e) => showInferred || e.evidence === "static");
  const neighbours = useMemo(() => {
    if (!selected) return null;
    const s = new Set([selected]);
    for (const e of visibleEdges) {
      if (e.source === selected) s.add(e.target);
      if (e.target === selected) s.add(e.source);
    }
    return s;
  }, [selected, visibleEdges]);

  const maxWeight = Math.max(1, ...data.edges.map((e) => e.weight));
  const nodes: Node<ArchNodeData>[] = data.nodes.map((n) => ({
    id: n.id,
    type: "arch",
    position: positions.get(n.id)!,
    data: { node: n, selected: n.id === selected, dimmed: !!neighbours && !neighbours.has(n.id) },
  }));
  const edges: Edge[] = visibleEdges.map((e) => {
    const active = !selected || e.source === selected || e.target === selected;
    const inferred = e.evidence === "inferred";
    const color = inferred ? "var(--violet)" : "var(--muted-foreground)";
    return {
      id: `${e.source}->${e.target}:${e.evidence}`,
      source: e.source,
      target: e.target,
      animated: inferred,
      label: inferred ? "inferred" : String(e.weight),
      labelStyle: { fontSize: 10, fill: "var(--muted-foreground)" },
      labelBgStyle: { fill: "var(--card)" },
      style: { stroke: color, strokeWidth: 1 + (2 * e.weight) / maxWeight, strokeDasharray: inferred ? "5 4" : undefined, opacity: active ? 0.9 : 0.12 },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
    };
  });

  const node = data.nodes.find((n) => n.id === selected) ?? null;
  const incoming = node ? data.edges.filter((e) => e.target === node.id) : [];
  const outgoing = node ? data.edges.filter((e) => e.source === node.id) : [];
  const label = (id: string) => data.nodes.find((n) => n.id === id)?.label ?? id;
  const kinds = [...new Set(data.nodes.map((n) => n.kind))];

  return (
    <div className="relative h-[calc(100dvh-16rem)] min-h-[520px] overflow-hidden rounded-xl border border-border bg-card" data-testid="architecture-map">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        nodesConnectable={false}
        onNodeClick={(_, n) => setSelected((s) => (s === n.id ? null : n.id))}
        onPaneClick={() => setSelected(null)}
        colorMode={resolvedTheme === "light" ? "light" : "dark"}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="var(--border)" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable className="!hidden md:!block" nodeColor={(n) => KIND_STYLE[(n.data as ArchNodeData).node.kind].color} />
      </ReactFlow>

      <div className="absolute left-3 top-3 max-w-[calc(100%-1.5rem)] rounded-lg border border-border bg-card/95 p-3 text-xs shadow-sm backdrop-blur">
        <p className="mb-2 font-medium">Legend</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {kinds.map((k) => {
            const s = KIND_STYLE[k];
            return (
              <span key={k} className="flex items-center gap-1.5 text-muted-foreground">
                <s.icon className="size-3" style={{ color: s.color }} /> {s.label}
              </span>
            );
          })}
        </div>
        <div className="mt-2 space-y-1 border-t border-border pt-2 text-muted-foreground">
          <span className="flex items-center gap-2"><span className="h-px w-5 bg-muted-foreground" /> Static import (count)</span>
          <span className="flex items-center gap-2"><span className="w-5 border-t border-dashed border-violet" /> Inferred (string match)</span>
          <label className="mt-1 flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={showInferred} onChange={(e) => setShowInferred(e.target.checked)} className="accent-[var(--primary)]" /> Show inferred
          </label>
        </div>
      </div>

      {node && (
        <aside className="absolute inset-y-0 right-0 z-10 flex w-full max-w-sm flex-col border-l border-border bg-card shadow-2xl" data-testid="node-panel">
          <div className="flex items-start justify-between gap-2 border-b border-border p-4">
            <div>
              <p className="text-xs text-muted-foreground">{KIND_STYLE[node.kind].label}</p>
              <h2 className="font-semibold">{node.label}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{node.description}</p>
            </div>
            <button onClick={() => setSelected(null)} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Close details">
              <X className="size-4" />
            </button>
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto p-4 text-sm">
            <EdgeList title="Depends on" edges={outgoing} name={(e) => label(e.target)} repositoryId={repositoryId} />
            <EdgeList title="Used by" edges={incoming} name={(e) => label(e.source)} repositoryId={repositoryId} />
            {node.files.length > 0 && (
              <section>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Files ({node.files.length})</h3>
                <ul className="space-y-1">
                  {node.files.slice(0, 80).map((f) => (
                    <li key={f}>
                      <Link href={explorerHref(repositoryId, { path: f, startLine: 0, endLine: 0 })} className="block truncate font-mono text-xs text-primary hover:underline">
                        {f}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

function EdgeList({ title, edges, name, repositoryId }: { title: string; edges: ArchEdge[]; name: (e: ArchEdge) => string; repositoryId: string }) {
  if (!edges.length) return null;
  return (
    <section>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</h3>
      <ul className="space-y-2">
        {edges.map((e) => (
          <li key={`${e.source}-${e.target}-${e.evidence}`} className="rounded-md border border-border p-2">
            <p className="flex items-center justify-between text-sm">
              <span className="font-medium">{name(e)}</span>
              <span className={cn("text-[11px]", e.evidence === "inferred" ? "text-violet" : "text-muted-foreground")}>
                {e.evidence === "inferred" ? "inferred" : `${e.weight} import${e.weight === 1 ? "" : "s"}`}
              </span>
            </p>
            {e.examples.slice(0, 2).map((x) => (
              <p key={x.from + x.to} className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                <Link href={explorerHref(repositoryId, { path: x.from, startLine: 0, endLine: 0 })} className="hover:text-primary">{x.from}</Link> → {x.to}
              </p>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
