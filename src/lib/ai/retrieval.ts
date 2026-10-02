import "server-only";
import type { SessionSupabase } from "@/lib/auth";
import { embedQuery } from "./provider";

export type RetrievedChunk = {
  id: string;
  path: string;
  language: string;
  symbol: string | null;
  symbolKind: string | null;
  content: string;
  startLine: number;
  endLine: number;
  score: number;
  via: ("vector" | "keyword")[];
};

type ChunkRow = {
  id: string;
  file_path: string;
  language: string;
  symbol_name: string | null;
  symbol_kind: string | null;
  chunk_content: string;
  start_line: number;
  end_line: number;
};

const RRF_K = 60;

/**
 * Hybrid retrieval: pgvector similarity + full-text/symbol search, fused with reciprocal
 * rank fusion. Runs with the user's session so RLS and the RPC ownership check both apply.
 */
export async function retrieveChunks(
  supabase: SessionSupabase,
  repositoryId: string,
  query: string,
  opts: { topK?: number; minSimilarity?: number } = {},
): Promise<RetrievedChunk[]> {
  const topK = Math.min(Math.max(opts.topK ?? Number(process.env.RAG_TOP_K ?? 8), 1), 20);
  const minSimilarity = opts.minSimilarity ?? Number(process.env.RAG_MIN_SIMILARITY ?? 0.25);

  const [vector, keyword] = await Promise.all([
    (async () => {
      try {
        const embedding = await embedQuery(query);
        if (!embedding) return [] as ChunkRow[];
        const { data, error } = await supabase.rpc("match_code_chunks", {
          p_repository_id: repositoryId,
          p_query_embedding: JSON.stringify(embedding),
          p_match_count: topK * 2,
          p_min_similarity: minSimilarity,
        });
        if (error) throw error;
        return (data ?? []) as ChunkRow[];
      } catch (e) {
        console.warn("vector search unavailable:", e instanceof Error ? e.message : e);
        return [] as ChunkRow[];
      }
    })(),
    (async () => {
      const { data, error } = await supabase.rpc("search_code_chunks", {
        p_repository_id: repositoryId,
        p_query: keywordQuery(query),
        p_match_count: topK * 2,
      });
      if (error) {
        console.warn("keyword search failed:", error.code);
        return [] as ChunkRow[];
      }
      return (data ?? []) as ChunkRow[];
    })(),
  ]);

  const fused = new Map<string, RetrievedChunk>();
  const add = (rows: ChunkRow[], via: "vector" | "keyword") =>
    rows.forEach((r, rank) => {
      const existing = fused.get(r.id);
      const score = 1 / (RRF_K + rank + 1);
      if (existing) {
        existing.score += score;
        existing.via.push(via);
      } else {
        fused.set(r.id, {
          id: r.id,
          path: r.file_path,
          language: r.language,
          symbol: r.symbol_name,
          symbolKind: r.symbol_kind,
          content: r.chunk_content,
          startLine: r.start_line,
          endLine: r.end_line,
          score,
          via: [via],
        });
      }
    });
  add(vector, "vector");
  add(keyword, "keyword");
  return [...fused.values()].sort((a, b) => b.score - a.score).slice(0, topK);
}

/** Turns a natural-language question into an OR-ed websearch query of meaningful terms. */
export function keywordQuery(q: string) {
  const stop = new Set(["the", "a", "an", "how", "does", "do", "what", "where", "is", "are", "to", "in", "of", "and", "or", "for", "this", "that", "it", "me", "explain", "show", "which", "with", "from", "work", "works"]);
  const terms = q
    .split(/[^A-Za-z0-9_$]+/)
    .filter((t) => t.length > 1 && !stop.has(t.toLowerCase()))
    .slice(0, 12);
  return terms.length ? terms.join(" or ") : q.slice(0, 200);
}
