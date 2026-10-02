# Implementation Status

_Last updated: 2026-10-02_

## Completed

| Area | Notes |
| --- | --- |
| Foundation | Next.js 16 App Router, strict TS, Tailwind v4 design tokens (dark-first + light), shadcn-style UI on Radix, `proxy.ts` session refresh + route protection |
| Database | `supabase/migrations/20261002000000_init.sql`: schema, enums, indexes, HNSW vector index, RLS on all tables, ownership helpers, `match_code_chunks` / `search_code_chunks` RPCs, DB rate limiter, private storage bucket + policies, profile trigger |
| Auth | Sign up, sign in, sign out, password reset (email link -> `/auth/reset-password`), callback code exchange, onboarding wizard (skippable optional fields), settings |
| Ingestion | GitHub public repo (zipball at pinned commit SHA) and ZIP upload (browser -> private bucket -> server). In-memory extraction, traversal protection, ignore rules, secret-file exclusion, binary sniffing, file/size limits, zip-bomb guard, secret redaction, idempotent re-index, concurrency lock, retry/refresh/force re-index, progress polling |
| Analysis | Symbols (TS compiler API / Python), import resolution incl. tsconfig aliases, tech stack, entry points, routes (Next app/pages, Express/Flask/FastAPI style), dependencies, docs coverage, architecture graph (static vs inferred edges), partial-failure tolerant; AI summary clearly labelled as inference |
| RAG | Syntax-aware chunking, optional embeddings (OpenAI-compatible, 1536-d), hybrid vector + full-text/symbol retrieval with RRF, RLS-scoped RPCs |
| Agent & chat | 7 real read-only tools with Zod schemas, step limit, tool error handling, untrusted-content policy; streaming chat, persistence, conversation list (new/rename/delete), tool-step display, markdown + Shiki code + Mermaid, copy actions, stop, retry, suggested prompts, `?q=` deep links, citations rendered only for tool-returned paths, expandable source references -> explorer |
| Architecture | React Flow map with zoom/pan/fit, minimap, legend, inferred-edge toggle, node detail panel with file links and example imports; workflow diagrams via the agent |
| Roadmap | AI-personalized (validated file paths) with deterministic fallback, task completion/reopen, progress, regenerate, ask-the-assistant per task |
| Code explorer | Tree, path + symbol search, lazy Shiki highlighting with line numbers, cited-range highlight + scroll, symbol outline, large-file fallback |
| Dashboard | Metrics from stored data only, recent activity, assistant entry, suggested next actions |
| UX states | Loading skeletons, empty states, error boundary, not-found, analysis gate (pending/processing/failed + retry), AI-not-configured notices, toasts |

## Test results (run on 2026-10-02)

- `npm run typecheck` - pass
- `npm run lint` - pass (0 problems)
- `npm test` - **96/96 unit tests pass** (URL validation, file filtering, path traversal, ZIP extraction, secret redaction, symbol parsing, chunking, import resolution, analysis/architecture, citations, tool input validation, ownership checks, deterministic roadmap)
- `npm run build` - pass
- `npm run test:e2e tests/e2e/public.spec.ts` (system Chrome) - 2/2 pass
- **Not yet run:** `tests/e2e/golden-path.spec.ts` and all integration behaviour against a live database/LLM (ingestion persistence, vector retrieval, chat API, RLS enforcement). These need a Supabase project and API keys, which were not available in the build environment.

## Setup required (external)

1. Supabase project + run the migration; configure auth redirect URLs.
2. `.env.local` values (see `.env.example`): Supabase URL, publishable key, service-role key; `ANTHROPIC_API_KEY` or `GROQ_API_KEY` for chat (Groq default model: `openai/gpt-oss-120b`); optional `EMBEDDING_API_KEY`, `GITHUB_TOKEN`.

## Outstanding / known limitations

- Integration tests for Supabase persistence, vector retrieval and RLS (e.g. a second user cannot read the first user's chunks) should be added and run against a local Supabase (`supabase start`) - not possible here (no Docker).
- Private GitHub repositories (GitHub App/OAuth) are intentionally not implemented in v1.
- Ingestion runs inside the request's `after()` budget (max 300 s); very large repositories should move to a queue/worker.
- Python/TS/JS get structural parsing; other languages use line-window chunking (no Tree-sitter dependency).
- Changing the embedding model dimension requires altering `code_chunks.embedding vector(1536)`.
