export type AnalysisStatus = "pending" | "processing" | "completed" | "failed";

export type Repository = {
  id: string;
  user_id: string;
  name: string;
  owner: string | null;
  repository_url: string | null;
  source_type: "github" | "zip";
  archive_path: string | null;
  default_branch: string | null;
  latest_commit_sha: string | null;
  description: string | null;
  analysis_status: AnalysisStatus;
  analysis_progress: number;
  analysis_message: string | null;
  analysis_error: string | null;
  analysis_started_at: string | null;
  analyzed_at: string | null;
  file_count: number;
  chunk_count: number;
  languages: Record<string, number>;
  created_at: string;
  updated_at: string;
};

export type SymbolInfo = {
  name: string;
  kind: "function" | "class" | "interface" | "type" | "enum" | "variable" | "method" | "component";
  line: number;
  endLine: number;
  exported: boolean;
};

export type SourceReference = {
  path: string;
  startLine: number;
  endLine: number;
  symbol?: string | null;
  excerpt?: string;
};

export type ArchNodeKind =
  | "frontend"
  | "backend"
  | "api"
  | "database"
  | "auth"
  | "module"
  | "external"
  | "config"
  | "tests";

export type ArchNode = {
  id: string;
  label: string;
  kind: ArchNodeKind;
  files: string[];
  description: string;
};

export type ArchEdge = {
  source: string;
  target: string;
  /** static = resolved import statements; inferred = string-match heuristics (e.g. fetch("/api/x")) */
  evidence: "static" | "inferred";
  weight: number;
  examples: { from: string; to: string }[];
};

export type ArchitectureData = { nodes: ArchNode[]; edges: ArchEdge[] };

export type EntryPoint = { path: string; reason: string };

export type DependencyData = {
  manifests: { path: string; ecosystem: "npm" | "python"; dependencies: string[]; devDependencies: string[]; scripts?: Record<string, string> }[];
  internalEdges: { from: string; to: string }[];
};

export type AnalysisFacts = {
  entryPoints: EntryPoint[];
  directories: { path: string; files: number }[];
  importantFiles: { path: string; reason: string }[];
  configFiles: string[];
  routes: { path: string; route: string; kind: "page" | "api" }[];
  docs: { readme: string | null; markdownFiles: number; codeFiles: number; filesWithDocComments: number };
  skipped: Record<string, number>;
  parseFailures: { path: string; error: string }[];
  truncated: boolean;
};

export type AiSummary = {
  purpose: string;
  overview: string;
  keyModules: { path: string; description: string }[];
  workflows: { name: string; description: string; files: string[] }[];
  documentationNotes: string;
};

export type TechItem = { name: string; category: string; evidence: string };
