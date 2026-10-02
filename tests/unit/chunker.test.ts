import { describe, expect, it } from "vitest";
import { chunkFile, embeddingText, MAX_CHUNK_LINES } from "@/lib/repo/chunker";
import { parseSource } from "@/lib/repo/symbols";

const ts = `import { db } from "./db";

/** Loads a user. */
export async function getUser(id: string) {
  return db.user.find(id);
}

export class UserService {
  constructor(private readonly repo: Repo) {}
  save(u: User) {
    return this.repo.save(u);
  }
}

const config = {
  retries: 3,
  timeout: 1000,
};
`;

describe("parseSource", () => {
  it("extracts TypeScript symbols with line ranges and imports", () => {
    const parsed = parseSource("src/user.ts", "typescript", ts);
    const names = parsed.symbols.map((s) => `${s.kind}:${s.name}@${s.line}-${s.endLine}`);
    expect(names).toContain("function:getUser@3-6");
    expect(names).toContain("class:UserService@8-13");
    expect(names).toContain("method:UserService.save@10-12");
    expect(names).toContain("variable:config@15-18");
    expect(parsed.imports).toEqual(["./db"]);
    expect(parsed.hasDocComments).toBe(true);
  });

  it("detects React components in TSX", () => {
    const parsed = parseSource("Button.tsx", "tsx", "export const Button = () => <button />;\nexport function Card() { return <div/>; }\n");
    expect(parsed.symbols.map((s) => `${s.kind}:${s.name}`)).toEqual(["component:Button", "component:Card"]);
  });

  it("extracts Python classes, methods, functions and imports", () => {
    const py = `import os\nfrom .models import User\n\n@app.get("/")\ndef index():\n    return 1\n\nclass Repo:\n    def save(self, u):\n        pass\n\n    def load(self):\n        pass\n`;
    const parsed = parseSource("app/main.py", "python", py);
    expect(parsed.imports).toEqual(["os", ".models"]);
    const names = parsed.symbols.map((s) => `${s.kind}:${s.name}@${s.line}-${s.endLine}`);
    expect(names).toEqual(["function:index@4-6", "class:Repo@8-13", "method:Repo.save@9-10", "method:Repo.load@12-13"]);
  });

  it("does not throw on malformed input", () => {
    expect(() => parseSource("x.ts", "typescript", "function (((")).not.toThrow();
  });
});

describe("chunkFile", () => {
  it("creates one chunk per top-level symbol plus module chunks for the rest", () => {
    const parsed = parseSource("src/user.ts", "typescript", ts);
    const chunks = chunkFile({ path: "src/user.ts", language: "typescript", content: ts, symbols: parsed.symbols });
    expect(chunks.map((c) => [c.symbolName, c.startLine, c.endLine])).toEqual([
      [null, 1, 1],
      ["getUser", 3, 6],
      ["UserService", 8, 13],
      ["config", 15, 18],
    ]);
    // Methods stay inside their class chunk instead of being split out.
    expect(chunks[2].content).toContain("save(u: User)");
  });

  it("splits very long symbols into overlapping windows", () => {
    const body = Array.from({ length: 300 }, (_, i) => `  const v${i} = ${i};`).join("\n");
    const content = `export function big() {\n${body}\n}\n`;
    const parsed = parseSource("big.ts", "typescript", content);
    const chunks = chunkFile({ path: "big.ts", language: "typescript", content, symbols: parsed.symbols });
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0].symbolName).toBe("big (part 1)");
    expect(chunks.every((c) => c.endLine - c.startLine + 1 <= MAX_CHUNK_LINES)).toBe(true);
    expect(chunks[1].startLine).toBeLessThan(chunks[0].endLine); // overlap
    expect(chunks.at(-1)!.endLine).toBe(302);
  });

  it("splits markdown by headings and falls back to line windows", () => {
    const md = "# Title\nintro\n\n## Setup\nnpm i\n\n## Usage\nrun it\n";
    const chunks = chunkFile({ path: "README.md", language: "markdown", content: md, symbols: [] });
    expect(chunks.map((c) => c.symbolName)).toEqual(["Title", "Setup", "Usage"]);
    const plain = chunkFile({ path: "a.txt", language: "text", content: "a\nb\nc", symbols: [] });
    expect(plain).toHaveLength(1);
    expect(plain[0]).toMatchObject({ startLine: 1, endLine: 3 });
  });

  it("returns no chunks for empty files", () => {
    expect(chunkFile({ path: "e.ts", language: "typescript", content: "  \n", symbols: [] })).toEqual([]);
  });

  it("embedding text carries path and symbol context", () => {
    expect(embeddingText("src/a.ts", { symbolName: "foo", content: "x" })).toBe("File: src/a.ts\nSymbol: foo\n\nx");
  });
});
