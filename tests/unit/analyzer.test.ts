import { describe, expect, it } from "vitest";
import { analyzeFiles, type SourceFile } from "@/lib/repo/analyzer";
import { aliasesFromTsconfig, packageName, resolveJsImport, resolvePythonImport } from "@/lib/repo/resolve";
import { classifyFile } from "@/lib/repo/classify";
import { detectLanguage } from "@/lib/repo/languages";

function file(path: string, content: string): SourceFile {
  return { path, content, size: content.length, language: detectLanguage(path) };
}

const repo: SourceFile[] = [
  file("package.json", JSON.stringify({ dependencies: { next: "16", react: "19", "@supabase/supabase-js": "2" }, devDependencies: { vitest: "5" }, scripts: { dev: "next dev" } })),
  file("tsconfig.json", `{ // comment\n "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }`),
  file("README.md", "# Demo app\nDoes things."),
  file("src/app/layout.tsx", `export default function RootLayout({ children }) { return <html>{children}</html>; }`),
  file("src/app/page.tsx", `import { Button } from "@/components/button";\nexport default function Home() { fetch("/api/users"); return <Button/>; }`),
  file("src/app/api/users/route.ts", `import { listUsers } from "@/lib/db/users";\nexport async function GET() { return Response.json(await listUsers()); }`),
  file("src/components/button.tsx", `export function Button() { return <button/>; }`),
  file("src/lib/db/users.ts", `import { createClient } from "@supabase/supabase-js";\nexport async function listUsers() { return createClient("u","k").from("users").select(); }`),
  file("src/lib/auth/session.ts", `export function getSession() { return null; }`),
  file("tests/users.test.ts", `import { listUsers } from "../src/lib/db/users";`),
];

describe("import resolution", () => {
  const files = new Set(["src/a.ts", "src/b/index.tsx", "src/c.ts", "pkg/mod.py", "pkg/sub/__init__.py"]);
  it("resolves relative, index and .js-suffixed imports", () => {
    expect(resolveJsImport("src/a.ts", "./b", files, [])).toBe("src/b/index.tsx");
    expect(resolveJsImport("src/b/index.tsx", "../c.js", files, [])).toBe("src/c.ts");
    expect(resolveJsImport("src/a.ts", "../../outside", files, [])).toBeNull();
  });
  it("resolves tsconfig path aliases", () => {
    const aliases = aliasesFromTsconfig(`{ "compilerOptions": { "baseUrl": ".", "paths": { "~/*": ["src/*"] } } }`);
    expect(resolveJsImport("x.ts", "~/c", files, aliases)).toBe("src/c.ts");
  });
  it("resolves python modules", () => {
    expect(resolvePythonImport("pkg/x.py", ".mod", files)).toBe("pkg/mod.py");
    expect(resolvePythonImport("main.py", "pkg.sub", files)).toBe("pkg/sub/__init__.py");
  });
  it("extracts package names", () => {
    expect(packageName("@scope/pkg/deep")).toBe("@scope/pkg");
    expect(packageName("lodash/fp")).toBe("lodash");
    expect(packageName("./x")).toBeNull();
    expect(packageName("node:fs")).toBeNull();
  });
});

describe("analyzeFiles", () => {
  const a = analyzeFiles(repo, { skipped: {}, truncated: false });

  it("detects the technology stack from manifests", () => {
    const names = a.techStack.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["Next.js", "React", "Supabase", "Vitest"]));
  });

  it("finds entry points and routes", () => {
    expect(a.facts.entryPoints.map((e) => e.path)).toEqual(expect.arrayContaining(["src/app/layout.tsx", "src/app/page.tsx"]));
    expect(a.facts.routes).toEqual(
      expect.arrayContaining([
        { path: "src/app/page.tsx", route: "/", kind: "page" },
        { path: "src/app/api/users/route.ts", route: "/api/users", kind: "api" },
      ]),
    );
  });

  it("resolves the internal import graph via the @/ alias", () => {
    const page = a.files.find((f) => f.path === "src/app/page.tsx")!;
    expect(page.resolvedImports).toEqual(["src/components/button.tsx"]);
    expect(a.dependencies.internalEdges).toContainEqual({ from: "src/app/api/users/route.ts", to: "src/lib/db/users.ts" });
  });

  it("builds an architecture graph with static and inferred edges", () => {
    const ids = a.architecture.nodes.map((n) => n.id);
    expect(ids).toEqual(expect.arrayContaining(["frontend", "api", "database", "auth", "tests", "external:Supabase"]));
    const edge = (s: string, t: string) => a.architecture.edges.find((e) => e.source === s && e.target === t);
    expect(edge("api", "database")?.evidence).toBe("static");
    expect(edge("database", "external:Supabase")?.evidence).toBe("static");
    expect(edge("frontend", "api")?.evidence).toBe("inferred");
  });

  it("records documentation facts", () => {
    expect(a.facts.docs.readme).toContain("Demo app");
  });
});

describe("classifyFile", () => {
  it.each([
    ["src/app/api/x/route.ts", "typescript", "api"],
    ["src/components/Nav.tsx", "tsx", "frontend"],
    ["prisma/schema.prisma", "prisma", "database"],
    ["src/auth/jwt.ts", "typescript", "auth"],
    ["src/services/mailer.ts", "typescript", "backend"],
    ["src/x.test.ts", "typescript", "tests"],
    ["package.json", "json", "config"],
    ["docs/guide.md", "markdown", null],
  ])("%s -> %s", (path, language, kind) => expect(classifyFile({ path, language })).toBe(kind));
});
