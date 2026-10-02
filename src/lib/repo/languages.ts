const EXT: Record<string, string> = {
  ts: "typescript", tsx: "tsx", mts: "typescript", cts: "typescript",
  js: "javascript", jsx: "jsx", mjs: "javascript", cjs: "javascript",
  py: "python", pyi: "python",
  json: "json", jsonc: "json",
  md: "markdown", mdx: "markdown",
  css: "css", scss: "scss", sass: "sass", less: "less",
  html: "html", htm: "html", vue: "vue", svelte: "svelte", astro: "astro",
  yml: "yaml", yaml: "yaml", toml: "toml", ini: "ini", xml: "xml",
  sql: "sql", prisma: "prisma", graphql: "graphql", gql: "graphql",
  sh: "shellscript", bash: "shellscript", zsh: "shellscript", ps1: "powershell",
  go: "go", rs: "rust", java: "java", kt: "kotlin", kts: "kotlin", swift: "swift",
  rb: "ruby", php: "php", cs: "csharp", c: "c", h: "c", cpp: "cpp", hpp: "cpp", cc: "cpp",
  dart: "dart", scala: "scala", ex: "elixir", exs: "elixir", lua: "lua", r: "r",
  txt: "text", svg: "xml", proto: "proto", tf: "hcl",
};

const NAMES: Record<string, string> = {
  dockerfile: "dockerfile", makefile: "makefile", procfile: "text", gemfile: "ruby",
  ".gitignore": "text", ".dockerignore": "text", ".editorconfig": "ini", license: "text",
};

export function detectLanguage(path: string): string {
  const base = path.split("/").pop()!.toLowerCase();
  if (NAMES[base]) return NAMES[base];
  if (base.startsWith("dockerfile")) return "dockerfile";
  if (base.startsWith(".env")) return "dotenv";
  const ext = base.includes(".") ? base.split(".").pop()! : "";
  return EXT[ext] ?? "text";
}

/** Languages that count as source code for stats (configs and docs excluded). */
export const CODE_LANGUAGES = new Set([
  "typescript", "tsx", "javascript", "jsx", "python", "go", "rust", "java", "kotlin", "swift",
  "ruby", "php", "csharp", "c", "cpp", "dart", "scala", "elixir", "lua", "vue", "svelte", "astro",
  "css", "scss", "sass", "less", "html", "sql", "shellscript",
]);

const DISPLAY: Record<string, string> = {
  typescript: "TypeScript", tsx: "TypeScript", javascript: "JavaScript", jsx: "JavaScript",
  python: "Python", json: "JSON", markdown: "Markdown", css: "CSS", scss: "SCSS", html: "HTML",
  yaml: "YAML", go: "Go", rust: "Rust", java: "Java", sql: "SQL", shellscript: "Shell",
  vue: "Vue", svelte: "Svelte", ruby: "Ruby", php: "PHP", csharp: "C#", cpp: "C++", c: "C",
  kotlin: "Kotlin", swift: "Swift", dart: "Dart", toml: "TOML", prisma: "Prisma", graphql: "GraphQL",
};

export function displayLanguage(lang: string) {
  return DISPLAY[lang] ?? lang.charAt(0).toUpperCase() + lang.slice(1);
}
