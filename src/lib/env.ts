import "server-only";
import { z } from "zod";

/**
 * Server-side configuration. Each feature validates only what it needs, so the app
 * still boots (and reports a clear error) when an optional provider is not configured.
 */
const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  AI_PROVIDER: z.enum(["anthropic", "groq"]).optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  AI_CHAT_MODEL: z.string().optional(),
  EMBEDDING_API_KEY: z.string().optional(),
  EMBEDDING_BASE_URL: z.url().optional(),
  EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  GITHUB_TOKEN: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  MAX_REPO_FILES: z.coerce.number().int().positive().default(1500),
  MAX_REPO_TOTAL_MB: z.coerce.number().positive().default(40),
  MAX_ARCHIVE_MB: z.coerce.number().positive().default(50),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

export class ConfigError extends Error {}

const blankToUndefined = (v: string | undefined) => (v ? v : undefined);

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const e = process.env;
  const parsed = serverSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: e.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: e.SUPABASE_SERVICE_ROLE_KEY,
    AI_PROVIDER: blankToUndefined(e.AI_PROVIDER),
    ANTHROPIC_API_KEY: blankToUndefined(e.ANTHROPIC_API_KEY),
    GROQ_API_KEY: blankToUndefined(e.GROQ_API_KEY),
    AI_CHAT_MODEL: blankToUndefined(e.AI_CHAT_MODEL),
    EMBEDDING_API_KEY: blankToUndefined(e.EMBEDDING_API_KEY),
    EMBEDDING_BASE_URL: blankToUndefined(e.EMBEDDING_BASE_URL),
    EMBEDDING_MODEL: blankToUndefined(e.EMBEDDING_MODEL),
    GITHUB_TOKEN: blankToUndefined(e.GITHUB_TOKEN),
    NEXT_PUBLIC_APP_URL: blankToUndefined(e.NEXT_PUBLIC_APP_URL),
    MAX_REPO_FILES: blankToUndefined(e.MAX_REPO_FILES),
    MAX_REPO_TOTAL_MB: blankToUndefined(e.MAX_REPO_TOTAL_MB),
    MAX_ARCHIVE_MB: blankToUndefined(e.MAX_ARCHIVE_MB),
  });
  if (!parsed.success) {
    const keys = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new ConfigError(`Missing or invalid server configuration: ${keys}`);
  }
  cached = parsed.data;
  return cached;
}

export type AiProvider = "anthropic" | "groq";

export const DEFAULT_CHAT_MODELS: Record<AiProvider, string> = {
  anthropic: "claude-sonnet-5-5",
  groq: "openai/gpt-oss-120b",
};

/** AI_PROVIDER wins; otherwise the first provider with a key (Anthropic, then Groq). */
export function resolveAiProvider(): AiProvider | null {
  const explicit = process.env.AI_PROVIDER;
  if (explicit === "anthropic" || explicit === "groq") return explicit;
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GROQ_API_KEY) return "groq";
  return null;
}

export function isAiConfigured() {
  const provider = resolveAiProvider();
  if (provider === "anthropic") return Boolean(process.env.ANTHROPIC_API_KEY);
  if (provider === "groq") return Boolean(process.env.GROQ_API_KEY);
  return false;
}

export function isEmbeddingConfigured() {
  return Boolean(process.env.EMBEDDING_API_KEY);
}
