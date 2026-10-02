/** Static import resolution used to build the module graph. Pure and unit tested. */

export type AliasMap = { prefix: string; targets: string[] }[];

const JS_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".vue", ".svelte"];

function normalize(path: string): string | null {
  const out: string[] = [];
  for (const seg of path.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      if (!out.length) return null;
      out.pop();
    } else out.push(seg);
  }
  return out.join("/");
}

function dirname(path: string) {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

function tryCandidates(base: string, files: Set<string>): string | null {
  if (files.has(base)) return base;
  const stripped = base.replace(/\.(js|jsx|mjs|cjs)$/, "");
  for (const b of stripped === base ? [base] : [stripped, base]) {
    for (const ext of JS_EXTS) if (files.has(b + ext)) return b + ext;
    for (const ext of JS_EXTS) if (files.has(`${b}/index${ext}`)) return `${b}/index${ext}`;
  }
  return null;
}

/** Reads `compilerOptions.paths` / `baseUrl` from a tsconfig/jsconfig (comments tolerated). */
export function aliasesFromTsconfig(text: string | undefined, configDir = ""): AliasMap {
  const fallback: AliasMap = [];
  if (!text) return fallback;
  try {
    const json = JSON.parse(text.replace(/\/\*[\s\S]*?\*\/|(^|[^:"])\/\/.*$/gm, "$1").replace(/,(\s*[}\]])/g, "$1"));
    const opts = json?.compilerOptions ?? {};
    const baseUrl = normalize([configDir, opts.baseUrl ?? "."].filter(Boolean).join("/")) ?? "";
    const paths: Record<string, string[]> = opts.paths ?? {};
    return Object.entries(paths).map(([key, targets]) => ({
      prefix: key.replace(/\*$/, ""),
      targets: targets.map((t) => normalize([baseUrl, t.replace(/\*$/, "")].filter(Boolean).join("/")) ?? ""),
    }));
  } catch {
    return fallback;
  }
}

export function resolveJsImport(from: string, spec: string, files: Set<string>, aliases: AliasMap): string | null {
  if (spec.startsWith(".")) {
    const base = normalize(`${dirname(from)}/${spec}`);
    return base === null ? null : tryCandidates(base, files);
  }
  for (const a of aliases) {
    if (a.prefix && spec.startsWith(a.prefix)) {
      const rest = spec.slice(a.prefix.length);
      for (const t of a.targets) {
        const hit = tryCandidates(normalize(`${t}/${rest}`) ?? "", files);
        if (hit) return hit;
      }
    }
  }
  return null;
}

export function resolvePythonImport(from: string, spec: string, files: Set<string>): string | null {
  let baseDir: string;
  let mod: string;
  if (spec.startsWith(".")) {
    const dots = /^\.+/.exec(spec)![0].length;
    let dir = dirname(from);
    for (let i = 1; i < dots; i++) dir = dirname(dir);
    baseDir = dir;
    mod = spec.slice(dots);
  } else {
    baseDir = "";
    mod = spec;
  }
  const rel = mod.replace(/\./g, "/");
  const roots = spec.startsWith(".") ? [baseDir] : ["", "src", "app"];
  for (const root of roots) {
    const base = [root, rel].filter(Boolean).join("/");
    if (!base) continue;
    for (const c of [`${base}.py`, `${base}/__init__.py`]) if (files.has(c)) return c;
  }
  return null;
}

/** "@scope/pkg/sub" -> "@scope/pkg", "lodash/fp" -> "lodash", "node:fs" -> null */
export function packageName(spec: string): string | null {
  if (spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("node:") || spec.startsWith("@/") || spec.startsWith("~/")) return null;
  const parts = spec.split("/");
  if (spec.startsWith("@")) return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
  return parts[0] || null;
}
