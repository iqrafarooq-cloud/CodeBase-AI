import { describe, expect, it } from "vitest";
import { explorerHref, extractSources, formatCitation, mergeSources, parseLineRange } from "@/lib/citations";
import { architectureToMermaid } from "@/lib/architecture";
import { explainFileInput, generateRoadmapInput, searchCodeInput, traceWorkflowInput } from "@/lib/ai/tool-schemas";

describe("citation formatting", () => {
  it("formats single lines and ranges", () => {
    expect(formatCitation({ path: "a.ts", startLine: 3, endLine: 3 })).toBe("a.ts:L3");
    expect(formatCitation({ path: "a.ts", startLine: 3, endLine: 9 })).toBe("a.ts:L3-L9");
    expect(formatCitation({ path: "a.ts", startLine: 0, endLine: 0 })).toBe("a.ts");
  });

  it("builds explorer links", () => {
    expect(explorerHref("r1", { path: "src/a b.ts", startLine: 2, endLine: 5 })).toBe("/repositories/r1/explorer?path=src%2Fa+b.ts&lines=2-5");
    expect(explorerHref("r1", { path: "x.ts", startLine: 0, endLine: 0 })).toBe("/repositories/r1/explorer?path=x.ts");
  });

  it("parses line ranges defensively", () => {
    expect(parseLineRange("10-20")).toEqual({ start: 10, end: 20 });
    expect(parseLineRange("7")).toEqual({ start: 7, end: 7 });
    expect(parseLineRange("20-10")).toBeNull();
    expect(parseLineRange("0")).toBeNull();
    expect(parseLineRange("abc")).toBeNull();
  });

  it("merges overlapping and adjacent ranges per file", () => {
    const merged = mergeSources([
      { path: "a.ts", startLine: 10, endLine: 20 },
      { path: "b.ts", startLine: 1, endLine: 5 },
      { path: "a.ts", startLine: 15, endLine: 30 },
      { path: "a.ts", startLine: 31, endLine: 35 },
      { path: "a.ts", startLine: 100, endLine: 110 },
    ]);
    expect(merged.map(formatCitation)).toEqual(["a.ts:L10-L35", "a.ts:L100-L110", "b.ts:L1-L5"]);
  });

  it("only extracts sources from completed tool outputs", () => {
    const sources = extractSources([
      { type: "text" },
      { type: "tool-search_code", state: "output-available", output: { sources: [{ path: "x.ts", startLine: 1, endLine: 2 }] } },
      { type: "tool-explain_file", state: "input-available", output: { sources: [{ path: "pending.ts", startLine: 1, endLine: 2 }] } },
      { type: "tool-analyze_repository", state: "output-available", output: { error: "x" } },
    ]);
    expect(sources.map((s) => s.path)).toEqual(["x.ts"]);
  });
});

describe("agent tool input validation", () => {
  it("search_code requires a meaningful query and caps the limit", () => {
    expect(searchCodeInput.safeParse({ query: "a" }).success).toBe(false);
    expect(searchCodeInput.safeParse({ query: "auth", limit: 100 }).success).toBe(false);
    expect(searchCodeInput.parse({ query: " login flow " })).toEqual({ query: "login flow", limit: 8 });
  });

  it("explain_file rejects paths that escape the repository", () => {
    for (const path of ["../secret", "/etc/passwd", "a/../../b", "a\0b"]) expect(explainFileInput.safeParse({ path }).success).toBe(false);
    expect(explainFileInput.parse({ path: "./src/index.ts" })).toEqual({ path: "src/index.ts" });
  });

  it("trace_workflow and roadmap inputs are validated", () => {
    expect(traceWorkflowInput.safeParse({ feature: "x" }).success).toBe(false);
    expect(generateRoadmapInput.safeParse({ confirm: false }).success).toBe(false);
    expect(generateRoadmapInput.safeParse({ confirm: true }).success).toBe(true);
  });
});

describe("architectureToMermaid", () => {
  it("emits safe ids and distinguishes inferred edges", () => {
    const out = architectureToMermaid({
      nodes: [
        { id: "frontend", label: 'UI "app"', kind: "frontend", files: ["a"], description: "" },
        { id: "external:Supabase", label: "Supabase", kind: "external", files: [], description: "" },
      ],
      edges: [
        { source: "frontend", target: "external:Supabase", evidence: "static", weight: 2, examples: [] },
        { source: "external:Supabase", target: "frontend", evidence: "inferred", weight: 1, examples: [] },
      ],
    });
    expect(out).toContain('n_frontend["UI app (1)"]');
    expect(out).toContain("n_frontend -->|2| n_external_Supabase");
    expect(out).toContain("n_external_Supabase -.->|inferred| n_frontend");
  });
});
