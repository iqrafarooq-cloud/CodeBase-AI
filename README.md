# CodeNexus - CodeBase AI

An AI-powered codebase intelligence platform. CodeBase AI helps newly onboarded developers understand an unfamiliar repository: it analyzes the source, maps the architecture, and gives them a tool-using agent that answers from the real code with verifiable file and line citations, plus a personalized onboarding roadmap.

## Features

- **Auth & onboarding** - Supabase email/password auth, password reset, protected routes, and a profile wizard covering experience, role and goals.
- **Repository ingestion** - public GitHub URL or ZIP upload. Ingestion filters out `node_modules`, build output, binaries and secret files, protects against path traversal, redacts credentials and never executes code.
- **Static analysis** - languages, symbols (TypeScript compiler API for TS/JS, indentation parser for Python), imports, entry points, routes, dependencies, tech stack and the module graph.
- **RAG** - syntax-aware chunks stored in pgvector, with hybrid retrieval (vector + full-text + symbol, fused with RRF) through RLS-protected RPCs.
- **Agentic chat** - 7 read-only tools (`search_code`, `explain_file`, `trace_workflow`, `analyze_repository`, `generate_architecture`, `generate_onboarding_roadmap`, `find_entry_points`). Answers stream with visible tool steps, and the source references come from tool output, not model text.
- **Architecture explorer** - React Flow map. Static import edges are kept separate from inferred ones, with a legend and a node detail panel. The assistant can draw Mermaid workflow diagrams.
- **Onboarding roadmap** - AI-personalized plan with a deterministic fallback. Every referenced file is validated against the repository, and task progress is tracked.
- **Code explorer** - file tree, path and symbol search, Shiki highlighting, line deep-links from citations, and a symbol outline.

## Stack

Next.js 16 (App Router), TypeScript (strict), Tailwind CSS v4, shadcn-style components on Radix, Lucide, Framer Motion, React Flow, Mermaid, Shiki, Supabase (Postgres, Auth, Storage, pgvector, RLS), Vercel AI SDK v7 + Anthropic or Groq (configurable), Zod, Octokit, fflate, Vitest, Playwright.

## Setup

1. **Install** - `npm install`
2. **Create a Supabase project** at <https://supabase.com>.
3. **Apply the migration** - run `supabase/migrations/20261002000000_init.sql`, either in the Supabase SQL editor or with `supabase link && supabase db push`. It enables `vector` and `pg_trgm` and creates the tables, RLS policies, retrieval RPCs, rate limiter and the private `repo-archives` storage bucket.
4. **Configure auth** - in Supabase, open Authentication -> URL Configuration. Set the Site URL to your app URL and add `<APP_URL>/auth/callback` to the redirect URLs. For local testing you can turn off "Confirm email".
5. **Environment** - `cp .env.example .env.local` and fill in the values. Every variable is documented in that file. The minimum is the Supabase URL, publishable key and service-role key; add `ANTHROPIC_API_KEY` or `GROQ_API_KEY` for chat.
6. **Run** - `npm run dev`, then open <http://localhost:3000>.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Playwright. The public specs always run; the golden path needs Supabase env vars and `E2E_REPO_URL`. Set `E2E_CHANNEL=chrome` to use an installed Chrome. |

## Deploying to Vercel

1. Import the repository in Vercel (framework preset: Next.js).
2. Add every variable from `.env.example`. Keep `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `EMBEDDING_API_KEY` and `GITHUB_TOKEN` as server-only (no `NEXT_PUBLIC_` prefix).
3. Set `NEXT_PUBLIC_APP_URL` to the production URL and add `<URL>/auth/callback` to the Supabase redirect URLs.
4. Ingestion runs through `after()` with `maxDuration = 300`. Repositories near the file limits need a plan that allows 300-second functions (Vercel Pro, or Hobby with Fluid compute).

## Manual test procedure (real repository)

1. Sign up and complete the onboarding wizard.
2. Connect `https://github.com/sindresorhus/ky` (small) or a repository you know well.
3. Watch the progress card until it shows "Completed". Then check that the tech stack, entry points and routes on the Overview match the repository.
4. In Chat, ask "Explain the application's entry point." Confirm the tool steps appear, expand **source references**, and click **Open**. The explorer should highlight the cited lines.
5. Ask about something that doesn't exist (e.g. "How does the Kafka consumer work?"). The assistant should say it found no evidence.
6. Open Architecture, click a node, and follow a file link.
7. Generate a roadmap, mark a task complete, and confirm the dashboard progress updates.
8. Upload a ZIP of a small project. Include a `.env` file and a `node_modules` folder, and check that both show up under "Ingestion notes" as skipped.

## Security model

- Identity always comes from the Supabase session on the server. Client-supplied user ids are never trusted.
- RLS on every user-owned table. Child tables (files, chunks, messages, tasks) are scoped through ownership helper functions. The retrieval RPCs are `security invoker` and also re-check ownership.
- The service-role key is used only by the ingestion worker, after ownership has been verified.
- Repository content is treated as untrusted. Prompts tell the model to ignore instructions embedded in code, all tools are read-only, and their inputs are validated with Zod.
- DB-backed rate limits apply to chat, ingestion and roadmap generation. Request bodies have size caps, and errors shown to users are sanitized.

See `IMPLEMENTATION_STATUS.md` for current status and known limitations.
