import { AnalysisGate } from "@/components/repo/analysis-gate";
import { CodeExplorer, type ExplorerFile } from "@/components/explorer/code-explorer";
import { loadRepository } from "@/lib/repo-page";
import type { SymbolInfo } from "@/lib/types";

export const metadata = { title: "Code Explorer" };

export default async function ExplorerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ path?: string; lines?: string }> }) {
  const { id } = await params;
  const { path, lines } = await searchParams;
  const { repo, supabase, gate, ready } = await loadRepository(id);
  if (!ready) return <AnalysisGate id={repo.id} initial={gate} />;

  const { data } = await supabase
    .from("repository_files")
    .select("file_path, language, file_size, line_count, symbols")
    .eq("repository_id", repo.id)
    .order("file_path")
    .limit(5000);

  const files: ExplorerFile[] = (data ?? []).map((f) => ({
    path: f.file_path,
    language: f.language,
    size: f.file_size,
    lines: f.line_count,
    symbols: ((f.symbols ?? []) as SymbolInfo[]).map((s) => ({ name: s.name, kind: s.kind, line: s.line })),
  }));

  return <CodeExplorer key={`${path ?? ""}:${lines ?? ""}`} repositoryId={repo.id} files={files} initialPath={path ?? null} initialLines={lines ?? null} />;
}
