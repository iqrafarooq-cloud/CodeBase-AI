import "server-only";
import type { SessionSupabase } from "@/lib/auth";

export const LIMITS = {
  chat: { limit: 20, windowSeconds: 60 },
  ingest: { limit: 6, windowSeconds: 600 },
  roadmap: { limit: 6, windowSeconds: 600 },
} as const;

/** DB-backed limiter (works across serverless instances). Identity is derived from auth.uid(). */
export async function consumeRateLimit(supabase: SessionSupabase, bucket: keyof typeof LIMITS) {
  const { limit, windowSeconds } = LIMITS[bucket];
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    p_bucket: bucket,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("rate limit check failed:", error.code);
    return false;
  }
  return data === true;
}
