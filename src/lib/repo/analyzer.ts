import type {
  AnalysisFacts,
  ArchEdge,
  ArchNode,
  ArchitectureData,
  DependencyData,
  EntryPoint,
  SymbolInfo,
  TechItem,
} from "@/lib/types";
import { CODE_LANGUAGES, displayLanguage } from "./languages";
import { classifyFile, isConfigFile, KIND_LABEL } from "./classify";
import { aliasesFromTsconfig, packageName, resolveJsImport, resolvePythonImport } from "./resolve";
import { parseSource } from "./symbols";

export type SourceFile = { path: string; language: string; size: number; content: string };

export type AnalyzedFile = SourceFile & {
  symbols: SymbolInfo[];
  rawImports: string[];
  resolvedImports: string[];
  packages: string[];
  hasDocComments: boolean;
  parseError?: string;
};

export type DeterministicAnalysis = {
  files: AnalyzedFile[];
  languages: Record<string, number>;
  techStack: TechItem[];
  facts: AnalysisFacts;
  dependencies: DependencyData;
  architecture: ArchitectureData;
};

// ---------------------------------------------------------------------------
// Parsing + import graph
// ---------------------------------------------------------------------------

export function parseAll(files: SourceFile[]): AnalyzedFile[] {
  const paths = new Set(files.map((f) => f.path));
  const tsconfig = files.find((f) => f.path === "tsconfig.json" || f.path === "jsconfig.json");
  const aliases = aliasesFromTsconfig(tsconfig?.content);
  if (!aliases.length) {
    // Common conventions when no tsconfig paths are declared.
    aliases.push({ prefix: "@/", targets: paths.has("src") || files.some((f) => f.path.startsWith("src/")) ? ["src"] : [""] });
    aliases.push({ prefix: "~/", targets: ["src", ""] });
  }

  return files.map((f) => {
    const parsed = parseSource(f.path, f.language, f.content);
    const resolved = new Set<string>();
    const packages = new Set<string>();
    for (const spec of parsed.imports) {
      const hit = f.language === "python" ? resolvePythonImport(f.path, spec, paths) : resolveJsImport(f.path, spec, paths, aliases);
      if (hit && hit !== f.path) resolved.add(hit);
      else if (!hit) {
        const pkg = f.language === "python" ? (spec.startsWith(".") ? null : spec.split(".")[0]) : packageName(spec);
        if (pkg) packages.add(pkg);
      }
    }
    return {
      ...f,
      symbols: parsed.symbols,
      rawImports: parsed.imports,
      resolvedImports: [...resolved],
      packages: [...packages],
      hasDocComments: parsed.hasDocComments,
      parseError: parsed.error,
    };
  });
}

// ---------------------------------------------------------------------------
// Technology detection
// ---------------------------------------------------------------------------

const KNOWN_PACKAGES: Record<string, { name: string; category: string }> = {
  next: { name: "Next.js", category: "Framework" },
  react: { name: "React", category: "UI library" },
  vue: { name: "Vue", category: "UI library" },
  nuxt: { name: "Nuxt", category: "Framework" },
  svelte: { name: "Svelte", category: "UI library" },
  "@sveltejs/kit": { name: "SvelteKit", category: "Framework" },
  "@angular/core": { name: "Angular", category: "Framework" },
  "solid-js": { name: "Solid", category: "UI library" },
  astro: { name: "Astro", category: "Framework" },
  "react-native": { name: "React Native", category: "Mobile" },
  expo: { name: "Expo", category: "Mobile" },
  express: { name: "Express", category: "Backend framework" },
  fastify: { name: "Fastify", category: "Backend framework" },
  koa: { name: "Koa", category: "Backend framework" },
  hono: { name: "Hono", category: "Backend framework" },
  "@nestjs/core": { name: "NestJS", category: "Backend framework" },
  "@trpc/server": { name: "tRPC", category: "API" },
  graphql: { name: "GraphQL", category: "API" },
  "@apollo/server": { name: "Apollo Server", category: "API" },
  prisma: { name: "Prisma", category: "Database" },
  "@prisma/client": { name: "Prisma", category: "Database" },
  "drizzle-orm": { name: "Drizzle ORM", category: "Database" },
  mongoose: { name: "Mongoose", category: "Database" },
  typeorm: { name: "TypeORM", category: "Database" },
  sequelize: { name: "Sequelize", category: "Database" },
  pg: { name: "PostgreSQL (pg)", category: "Database" },
  "@supabase/supabase-js": { name: "Supabase", category: "Backend service" },
  firebase: { name: "Firebase", category: "Backend service" },
  "next-auth": { name: "NextAuth.js", category: "Authentication" },
  "@auth/core": { name: "Auth.js", category: "Authentication" },
  "@clerk/nextjs": { name: "Clerk", category: "Authentication" },
  passport: { name: "Passport", category: "Authentication" },
  jsonwebtoken: { name: "JSON Web Tokens", category: "Authentication" },
  tailwindcss: { name: "Tailwind CSS", category: "Styling" },
  "styled-components": { name: "styled-components", category: "Styling" },
  "@emotion/react": { name: "Emotion", category: "Styling" },
  redux: { name: "Redux", category: "State management" },
  "@reduxjs/toolkit": { name: "Redux Toolkit", category: "State management" },
  zustand: { name: "Zustand", category: "State management" },
  "@tanstack/react-query": { name: "TanStack Query", category: "Data fetching" },
  swr: { name: "SWR", category: "Data fetching" },
  zod: { name: "Zod", category: "Validation" },
  vite: { name: "Vite", category: "Build tool" },
  webpack: { name: "webpack", category: "Build tool" },
  typescript: { name: "TypeScript", category: "Language" },
  vitest: { name: "Vitest", category: "Testing" },
  jest: { name: "Jest", category: "Testing" },
  "@playwright/test": { name: "Playwright", category: "Testing" },
  cypress: { name: "Cypress", category: "Testing" },
  mocha: { name: "Mocha", category: "Testing" },
  eslint: { name: "ESLint", category: "Code quality" },
  ai: { name: "Vercel AI SDK", category: "AI" },
  openai: { name: "OpenAI SDK", category: "AI" },
  "@anthropic-ai/sdk": { name: "Anthropic SDK", category: "AI" },
  stripe: { name: "Stripe", category: "Payments" },
  "socket.io": { name: "Socket.IO", category: "Realtime" },
  redis: { name: "Redis", category: "Cache" },
  ioredis: { name: "Redis", category: "Cache" },
  // Python
  django: { name: "Django", category: "Backend framework" },
  flask: { name: "Flask", category: "Backend framework" },
  fastapi: { name: "FastAPI", category: "Backend framework" },
  sqlalchemy: { name: "SQLAlchemy", category: "Database" },
  pydantic: { name: "Pydantic", category: "Validation" },
  pytest: { name: "pytest", category: "Testing" },
  celery: { name: "Celery", category: "Background jobs" },
  numpy: { name: "NumPy", category: "Data" },
  pandas: { name: "pandas", category: "Data" },
  torch: { name: "PyTorch", category: "Machine learning" },
  langchain: { name: "LangChain", category: "AI" },
};

const EXTERNAL_SERVICES: Record<string, string> = {
  "@supabase/supabase-js": "Supabase", "@supabase/ssr": "Supabase", firebase: "Firebase", "firebase-admin": "Firebase",
  stripe: "Stripe", openai: "OpenAI", "@ai-sdk/openai": "OpenAI", "@anthropic-ai/sdk": "Anthropic",
  "@ai-sdk/anthropic": "Anthropic", anthropic: "Anthropic", octokit: "GitHub API", "@octokit/rest": "GitHub API",
  "@aws-sdk/client-s3": "AWS", "aws-sdk": "AWS", boto3: "AWS", mongoose: "MongoDB", mongodb: "MongoDB", pymongo: "MongoDB",
  redis: "Redis", ioredis: "Redis", resend: "Resend (email)", "@sendgrid/mail": "SendGrid (email)", nodemailer: "SMTP email",
  twilio: "Twilio", "@sentry/nextjs": "Sentry", "@sentry/node": "Sentry", "@vercel/blob": "Vercel Blob",
  "@vercel/kv": "Vercel KV", "@clerk/nextjs": "Clerk", pg: "PostgreSQL", postgres: "PostgreSQL", psycopg2: "PostgreSQL",
  "@prisma/client": "Database (Prisma)", requests: "HTTP APIs", axios: "HTTP APIs",
};

function readJson(content: string | undefined): Record<string, unknown> | null {
  if (!content) return null;
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function pythonDeps(content: string): string[] {
  return content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("-"))
    .map((l) => l.split(/[<>=!~\[;\s]/)[0].toLowerCase())
    .filter(Boolean);
}

function pyprojectDeps(content: string): string[] {
  const deps = new Set<string>();
  const block = /dependencies\s*=\s*\[([\s\S]*?)\]/g;
  let m: RegExpExecArray | null;
  while ((m = block.exec(content))) for (const s of m[1].matchAll(/["']([A-Za-z0-9_.-]+)/g)) deps.add(s[1].toLowerCase());
  const poetry = /\[tool\.poetry\.dependencies\]([\s\S]*?)(\n\[|$)/.exec(content);
  if (poetry) for (const s of poetry[1].matchAll(/^([A-Za-z0-9_.-]+)\s*=/gm)) if (s[1] !== "python") deps.add(s[1].toLowerCase());
  return [...deps];
}

export function collectDependencies(files: AnalyzedFile[]): DependencyData {
  const manifests: DependencyData["manifests"] = [];
  for (const f of files) {
    const base = f.path.split("/").pop();
    if (base === "package.json") {
      const pkg = readJson(f.content);
      if (!pkg) continue;
      manifests.push({
        path: f.path,
        ecosystem: "npm",
        dependencies: Object.keys((pkg.dependencies as object) ?? {}),
        devDependencies: Object.keys((pkg.devDependencies as object) ?? {}),
        scripts: (pkg.scripts as Record<string, string>) ?? {},
      });
    } else if (base && /^requirements.*\.txt$/.test(base)) {
      manifests.push({ path: f.path, ecosystem: "python", dependencies: pythonDeps(f.content), devDependencies: [] });
    } else if (base === "pyproject.toml") {
      manifests.push({ path: f.path, ecosystem: "python", dependencies: pyprojectDeps(f.content), devDependencies: [] });
    }
  }
  const internalEdges = files.flatMap((f) => f.resolvedImports.map((to) => ({ from: f.path, to })));
  return { manifests, internalEdges };
}

export function detectTechStack(files: AnalyzedFile[], deps: DependencyData, languages: Record<string, number>): TechItem[] {
  const items = new Map<string, TechItem>();
  const add = (name: string, category: string, evidence: string) => {
    if (!items.has(name)) items.set(name, { name, category, evidence });
  };
  const langTotals = Object.entries(languages).sort((a, b) => b[1] - a[1]);
  for (const [lang] of langTotals.slice(0, 4)) {
    if (CODE_LANGUAGES.has(lang)) add(displayLanguage(lang), "Language", `${languages[lang]} file(s)`);
  }
  for (const m of deps.manifests) {
    for (const d of [...m.dependencies, ...m.devDependencies]) {
      const known = KNOWN_PACKAGES[d];
      if (known) add(known.name, known.category, `${d} in ${m.path}`);
    }
  }
  const has = (re: RegExp) => files.find((f) => re.test(f.path));
  const marker: [RegExp, string, string][] = [
    [/(^|\/)Dockerfile$/, "Docker", "Containerization"],
    [/(^|\/)docker-compose\.ya?ml$/, "Docker Compose", "Containerization"],
    [/^\.github\/workflows\//, "GitHub Actions", "CI/CD"],
    [/(^|\/)vercel\.json$/, "Vercel", "Hosting"],
    [/(^|\/)supabase\/(migrations|config\.toml)/, "Supabase", "Backend service"],
    [/(^|\/)schema\.prisma$/, "Prisma", "Database"],
    [/(^|\/)tailwind\.config\./, "Tailwind CSS", "Styling"],
    [/(^|\/)manage\.py$/, "Django", "Backend framework"],
  ];
  for (const [re, name, category] of marker) {
    const f = has(re);
    if (f) add(name, category, f.path);
  }
  return [...items.values()];
}

// ---------------------------------------------------------------------------
// Entry points, routes, structure
// ---------------------------------------------------------------------------

const ENTRY_PATTERNS: [RegExp, string][] = [
  [/^(src\/)?app\/layout\.(t|j)sx?$/, "Next.js App Router root layout - wraps every page"],
  [/^(src\/)?app\/page\.(t|j)sx?$/, "Next.js App Router home page"],
  [/^(src\/)?pages\/_app\.(t|j)sx?$/, "Next.js Pages Router application shell"],
  [/^(src\/)?(proxy|middleware)\.(t|j)s$/, "Next.js proxy/middleware - runs before matching requests"],
  [/^(src\/)?(main|index)\.(t|j)sx$/, "Client application bootstrap (renders the root component)"],
  [/^index\.html$/, "HTML entry loaded by the browser / bundler"],
  [/^(src\/)?(server|app|index|main)\.(t|j)s$/, "Server / application bootstrap"],
  [/^(src\/)?(main|app|wsgi|asgi|run|server)\.py$/, "Python application entry"],
  [/^manage\.py$/, "Django management entry point"],
  [/(^|\/)__main__\.py$/, "Python package entry (python -m)"],
];

export function findEntryPoints(files: AnalyzedFile[], deps: DependencyData): EntryPoint[] {
  const out = new Map<string, string>();
  const paths = new Set(files.map((f) => f.path));
  for (const f of files) {
    for (const [re, reason] of ENTRY_PATTERNS) if (re.test(f.path) && !out.has(f.path)) out.set(f.path, reason);
    if (f.language === "python" && /if\s+__name__\s*==\s*["']__main__["']/.test(f.content) && !out.has(f.path)) {
      out.set(f.path, 'Runs as a script (has `if __name__ == "__main__"`)');
    }
  }
  for (const m of deps.manifests.filter((x) => x.ecosystem === "npm")) {
    const pkgFile = files.find((f) => f.path === m.path);
    const pkg = readJson(pkgFile?.content);
    const dir = m.path.includes("/") ? m.path.slice(0, m.path.lastIndexOf("/") + 1) : "";
    const candidates: [unknown, string][] = [[pkg?.main, "package.json \"main\""], [pkg?.module, "package.json \"module\""]];
    const bin = pkg?.bin;
    if (typeof bin === "string") candidates.push([bin, "package.json \"bin\" (CLI)"]);
    else if (bin && typeof bin === "object") for (const v of Object.values(bin)) candidates.push([v, "package.json \"bin\" (CLI)"]);
    for (const script of ["start", "dev", "serve"]) {
      const cmd = m.scripts?.[script];
      const file = cmd && /(?:node|tsx|ts-node|nodemon|bun)\s+([\w./-]+\.(?:m?[jt]s))/.exec(cmd)?.[1];
      if (file) candidates.push([file, `npm script "${script}": ${cmd}`]);
    }
    for (const [value, reason] of candidates) {
      if (typeof value !== "string") continue;
      const p = (dir + value).replace(/^\.\//, "").replace(/\/\.\//g, "/");
      const hit = [p, p.replace(/^dist\//, "src/").replace(/\.js$/, ".ts")].find((c) => paths.has(c));
      if (hit && !out.has(hit)) out.set(hit, reason);
    }
  }
  return [...out.entries()].map(([path, reason]) => ({ path, reason })).slice(0, 25);
}

export function findRoutes(files: AnalyzedFile[]): AnalysisFacts["routes"] {
  const routes: AnalysisFacts["routes"] = [];
  for (const f of files) {
    const app = /^(?:src\/)?app\/(.*?)(?:\/)?(page|route)\.(?:t|j)sx?$/.exec(f.path);
    if (app) {
      const segs = app[1].split("/").filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith("@"));
      routes.push({ path: f.path, route: "/" + segs.join("/"), kind: app[2] === "route" ? "api" : "page" });
      continue;
    }
    const pages = /^(?:src\/)?pages\/(.*)\.(?:t|j)sx?$/.exec(f.path);
    if (pages && !/^_/.test(pages[1].split("/").pop()!)) {
      const route = "/" + pages[1].replace(/(^|\/)index$/, "");
      routes.push({ path: f.path, route, kind: pages[1].startsWith("api/") ? "api" : "page" });
      continue;
    }
    if (["typescript", "javascript", "python"].includes(f.language)) {
      const re = /(?:\b(?:app|router|server|api|bp|blueprint)\.(get|post|put|patch|delete|route|all))\(\s*["'`](\/[^"'`]*)["'`]/g;
      let m: RegExpExecArray | null;
      let n = 0;
      while ((m = re.exec(f.content)) && n < 40) {
        routes.push({ path: f.path, route: `${m[1] === "route" || m[1] === "all" ? "" : m[1].toUpperCase() + " "}${m[2]}`, kind: "api" });
        n++;
      }
    }
  }
  return routes.slice(0, 200);
}

function moduleNodeId(path: string) {
  const top = path.includes("/") ? path.split("/")[0] : "(root)";
  return `module:${top}`;
}

export function buildArchitecture(files: AnalyzedFile[], routes: AnalysisFacts["routes"]): ArchitectureData {
  const nodes = new Map<string, ArchNode>();
  const fileNode = new Map<string, string>();

  for (const f of files) {
    const kind = classifyFile(f);
    if (!kind || kind === "config") continue;
    const id = kind === "module" ? moduleNodeId(f.path) : kind;
    if (!nodes.has(id)) {
      nodes.set(id, {
        id,
        kind,
        label: kind === "module" ? `${id.slice(7)}/` : KIND_LABEL[kind],
        files: [],
        description: "",
      });
    }
    nodes.get(id)!.files.push(f.path);
    fileNode.set(f.path, id);
  }

  const edges = new Map<string, ArchEdge>();
  const addEdge = (source: string, target: string, evidence: ArchEdge["evidence"], from: string, to: string) => {
    if (source === target) return;
    const key = `${source}->${target}:${evidence}`;
    const e = edges.get(key) ?? { source, target, evidence, weight: 0, examples: [] };
    e.weight++;
    if (e.examples.length < 5) e.examples.push({ from, to });
    edges.set(key, e);
  };

  for (const f of files) {
    const src = fileNode.get(f.path);
    if (!src) continue;
    for (const to of f.resolvedImports) {
      const dst = fileNode.get(to);
      if (dst) addEdge(src, dst, "static", f.path, to);
    }
    for (const pkg of f.packages) {
      const service = EXTERNAL_SERVICES[pkg];
      if (!service) continue;
      const id = `external:${service}`;
      if (!nodes.has(id)) nodes.set(id, { id, kind: "external", label: service, files: [], description: `Detected through imports of ${pkg}` });
      addEdge(src, id, "static", f.path, pkg);
    }
  }

  // Inferred: client code referencing an API route path by string literal.
  const apiRoutes = routes.filter((r) => r.kind === "api" && r.route.startsWith("/") && r.route.length > 4 && !r.route.includes("["));
  if (apiRoutes.length) {
    for (const f of files) {
      const src = fileNode.get(f.path);
      if (!src || src === "api") continue;
      for (const r of apiRoutes) {
        if (f.content.includes(`"${r.route}`) || f.content.includes(`'${r.route}`) || f.content.includes(`\`${r.route}`)) {
          const dst = fileNode.get(r.path);
          if (dst) addEdge(src, dst, "inferred", f.path, r.path);
        }
      }
    }
  }

  for (const n of nodes.values()) {
    if (!n.description) n.description = `${n.files.length} file(s) classified by path and file type`;
    n.files.sort();
  }

  // Keep the diagram readable: drop tiny module nodes without edges when there are many.
  let list = [...nodes.values()];
  if (list.length > 18) {
    const connected = new Set([...edges.values()].flatMap((e) => [e.source, e.target]));
    list = list.filter((n) => n.kind !== "module" || connected.has(n.id) || n.files.length >= 3).slice(0, 24);
  }
  const keep = new Set(list.map((n) => n.id));
  return {
    nodes: list,
    edges: [...edges.values()].filter((e) => keep.has(e.source) && keep.has(e.target)),
  };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export function analyzeFiles(source: SourceFile[], extra: { skipped: Record<string, number>; truncated: boolean }): DeterministicAnalysis {
  const files = parseAll(source);
  const languages: Record<string, number> = {};
  for (const f of files) languages[f.language] = (languages[f.language] ?? 0) + 1;

  const dependencies = collectDependencies(files);
  const techStack = detectTechStack(files, dependencies, languages);
  const entryPoints = findEntryPoints(files, dependencies);
  const routes = findRoutes(files);

  const dirCounts = new Map<string, number>();
  for (const f of files) {
    const parts = f.path.split("/");
    const key = parts.length === 1 ? "(root)" : parts.length === 2 ? parts[0] : `${parts[0]}/${parts[1]}`;
    dirCounts.set(key, (dirCounts.get(key) ?? 0) + 1);
  }

  const inDegree = new Map<string, number>();
  for (const e of dependencies.internalEdges) inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
  const important = new Map<string, string>();
  const readme = files.find((f) => /^readme(\.\w+)?$/i.test(f.path));
  if (readme) important.set(readme.path, "Project README");
  for (const e of entryPoints) important.set(e.path, `Entry point: ${e.reason}`);
  for (const m of dependencies.manifests) important.set(m.path, "Dependency manifest");
  [...inDegree.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .forEach(([path, n]) => important.has(path) || important.set(path, `Imported by ${n} file(s)`));

  const codeFiles = files.filter((f) => CODE_LANGUAGES.has(f.language));
  const facts: AnalysisFacts = {
    entryPoints,
    directories: [...dirCounts.entries()].map(([path, n]) => ({ path, files: n })).sort((a, b) => b.files - a.files).slice(0, 40),
    importantFiles: [...important.entries()].map(([path, reason]) => ({ path, reason })).slice(0, 30),
    configFiles: files.filter((f) => isConfigFile(f.path)).map((f) => f.path).slice(0, 50),
    routes,
    docs: {
      readme: readme ? readme.content.slice(0, 6000) : null,
      markdownFiles: files.filter((f) => f.language === "markdown").length,
      codeFiles: codeFiles.length,
      filesWithDocComments: codeFiles.filter((f) => f.hasDocComments).length,
    },
    skipped: extra.skipped,
    parseFailures: files.filter((f) => f.parseError).map((f) => ({ path: f.path, error: f.parseError! })).slice(0, 50),
    truncated: extra.truncated,
  };

  return { files, languages, techStack, facts, dependencies, architecture: buildArchitecture(files, routes) };
}
