import type { ArchitectureData } from "@/lib/types";

function safeId(id: string) {
  return "n_" + id.replace(/[^A-Za-z0-9_]/g, "_");
}

function safeLabel(label: string) {
  return label.replace(/["<>`]/g, "").slice(0, 60);
}

/** Deterministic Mermaid flowchart. Static edges are solid, inferred edges dashed. */
export function architectureToMermaid(data: ArchitectureData, maxEdges = 40) {
  const lines = ["flowchart LR"];
  for (const n of data.nodes) lines.push(`  ${safeId(n.id)}["${safeLabel(n.label)} (${n.files.length})"]`);
  const edges = [...data.edges].sort((a, b) => b.weight - a.weight).slice(0, maxEdges);
  for (const e of edges) {
    lines.push(e.evidence === "static" ? `  ${safeId(e.source)} -->|${e.weight}| ${safeId(e.target)}` : `  ${safeId(e.source)} -.->|inferred| ${safeId(e.target)}`);
  }
  return lines.join("\n");
}
