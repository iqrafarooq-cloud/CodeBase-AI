import type { ArchNodeKind } from "@/lib/types";
import { CODE_LANGUAGES } from "./languages";

const CONFIG_FILE = /(^|\/)(package\.json|tsconfig[^/]*\.json|jsconfig\.json|next\.config\.[mc]?[jt]s|vite\.config\.[mc]?[jt]s|tailwind\.config\.[mc]?[jt]s|postcss\.config\.[mc]?[jt]s|eslint\.config\.[mc]?[jt]s|\.eslintrc(\.\w+)?|webpack\.config\.[jt]s|babel\.config\.[jt]s|vitest\.config\.[mc]?[jt]s|jest\.config\.[mc]?[jt]s|playwright\.config\.[jt]s|Dockerfile|docker-compose\.ya?ml|vercel\.json|netlify\.toml|pyproject\.toml|setup\.py|setup\.cfg|requirements[^/]*\.txt|Makefile|\.env\.example|config\.toml)$/;

export function isConfigFile(path: string) {
  return CONFIG_FILE.test(path);
}

export const KIND_LABEL: Record<ArchNodeKind, string> = {
  frontend: "Frontend (UI)",
  backend: "Backend / services",
  api: "API routes",
  database: "Database & data access",
  auth: "Authentication",
  module: "Module",
  external: "External service",
  config: "Configuration",
  tests: "Tests",
};

export function classifyFile(f: { path: string; language: string }): ArchNodeKind | null {
  const p = f.path.toLowerCase();
  if (isConfigFile(f.path)) return "config";
  if (!CODE_LANGUAGES.has(f.language) && f.language !== "prisma" && f.language !== "graphql") return null;
  if (/(^|\/)(__tests__|tests?|spec|e2e|cypress)\/|\.(test|spec)\.[a-z]+$|(^|\/)test_[^/]+\.py$|_test\.py$/.test(p)) return "tests";
  if (/(^|\/)(auth|authentication|login|signup|session|oauth|passport)([./_-]|\/|$)/.test(p) || /(^|\/)(proxy|middleware)\.(t|j)s$/.test(p)) return "auth";
  if (/(^|\/)app\/.*\/route\.(t|j)s$|(^|\/)pages\/api\/|(^|\/)(routes?|controllers?|endpoints?|handlers?|api)\//.test(p)) return "api";
  if (/(^|\/)(db|database|prisma|models?|schemas?|migrations?|supabase|repositor(y|ies)|drizzle|orm|entities)([./_-]|\/|$)/.test(p) || f.language === "sql" || f.language === "prisma") return "database";
  if (["tsx", "jsx", "vue", "svelte", "astro", "css", "scss", "sass", "less", "html"].includes(f.language)) return "frontend";
  if (/(^|\/)(components?|pages|app|views|ui|hooks|styles|layouts|screens|widgets)\//.test(p)) return "frontend";
  if (/(^|\/)(server|services?|workers?|jobs|queues?|lib|core|domain|utils?|helpers?)\//.test(p)) return "backend";
  return "module";
}
