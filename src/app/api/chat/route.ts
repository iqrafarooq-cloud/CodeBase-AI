import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { getOwnedRepository, getSessionUser } from "@/lib/auth";
import { extractSources } from "@/lib/citations";
import { jsonError, readJson, RequestTooLarge, zodError } from "@/lib/http";
import { consumeRateLimit } from "@/lib/rate-limit";
import { isAiConfigured } from "@/lib/env";
import { chatModel } from "@/lib/ai/provider";
import { createAgentTools } from "@/lib/ai/tools";
import { buildSystemPrompt, MAX_TOOL_STEPS } from "@/lib/ai/prompts";

export const maxDuration = 120;

const HISTORY_MESSAGES = 12;

const bodySchema = z.object({
  conversationId: z.uuid(),
  message: z.object({
    id: z.string().min(1).max(100),
    role: z.literal("user"),
    parts: z.array(z.object({ type: z.literal("text"), text: z.string().trim().min(1).max(4000) })).min(1).max(1),
  }),
});

type StoredMessage = { ui_id: string; role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  const { supabase, user } = await getSessionUser();
  if (!user) return jsonError(401, "Please sign in again.", "unauthorized");

  let body: unknown;
  try {
    body = await readJson(req, 32 * 1024);
  } catch (e) {
    if (e instanceof RequestTooLarge) return jsonError(413, "Message is too large.");
    throw e;
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);
  const { conversationId, message } = parsed.data;

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, repository_id, title")
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!conversation) return jsonError(404, "Conversation not found.", "not_found");

  const repo = await getOwnedRepository(supabase, user.id, conversation.repository_id);
  if (!repo) return jsonError(404, "Repository not found.", "not_found");
  if (repo.analysis_status !== "completed") return jsonError(409, "This repository has not finished analysis yet.", "not_ready");
  if (!isAiConfigured()) return jsonError(503, "The AI provider is not configured on the server. Add ANTHROPIC_API_KEY or GROQ_API_KEY.", "ai_not_configured");
  if (!(await consumeRateLimit(supabase, "chat"))) return jsonError(429, "You are sending messages too quickly. Please wait a minute.", "rate_limited");

  const [{ data: history }, { data: profile }] = await Promise.all([
    supabase
      .from("messages")
      .select("ui_id, role, content")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(HISTORY_MESSAGES),
    supabase.from("profiles").select("display_name, experience_level, developer_role, learning_goal").eq("id", user.id).maybeSingle(),
  ]);

  const userText = message.parts[0].text;
  const { error: saveError } = await supabase
    .from("messages")
    .upsert({ conversation_id: conversation.id, ui_id: message.id, role: "user", content: userText, parts: message.parts }, { onConflict: "conversation_id,ui_id" });
  if (saveError) return jsonError(500, "Could not save your message.");
  if (conversation.title === "New conversation") {
    await supabase.from("conversations").update({ title: userText.slice(0, 80) }).eq("id", conversation.id);
  } else {
    await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversation.id);
  }

  // Earlier turns are sent as plain text: evidence is re-retrieved for every new question,
  // which keeps the context small and avoids replaying stale tool output.
  const prior: UIMessage[] = ((history ?? []) as StoredMessage[])
    .reverse()
    .filter((m) => m.ui_id !== message.id && m.content.trim())
    .map((m) => ({ id: m.ui_id, role: m.role, parts: [{ type: "text", text: m.content.slice(0, 6000) }] }));
  const uiMessages: UIMessage[] = [...prior, message as UIMessage];

  const tools = createAgentTools({ supabase, userId: user.id, repo });
  const result = streamText({
    model: chatModel(),
    system: buildSystemPrompt(repo, profile),
    messages: await convertToModelMessages(uiMessages),
    tools,
    stopWhen: isStepCount(MAX_TOOL_STEPS),
    maxRetries: 2,
    abortSignal: req.signal,
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      tools,
      originalMessages: uiMessages,
      messageMetadata: ({ part }) => (part.type === "start" ? { createdAt: Date.now() } : undefined),
      onError: (error) => {
        console.error("chat stream error:", error instanceof Error ? error.message : error);
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 429) return "The AI provider is rate limiting requests. Please try again shortly.";
        if (status === 401) return "The AI provider rejected the server credentials.";
        return "The assistant could not complete this answer. Please try again.";
      },
      onEnd: async ({ responseMessage }) => {
        if (!responseMessage || responseMessage.role !== "assistant") return;
        const text = responseMessage.parts
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("\n\n");
        const sources = extractSources(responseMessage.parts as { type: string; state?: string; output?: unknown }[]);
        // Tool outputs can be large; persist only what the UI needs to re-render the turn.
        const parts = responseMessage.parts
          .filter((p) => p.type === "text" || p.type.startsWith("tool-"))
          .map((p) => (p.type === "text" ? p : { type: p.type, state: (p as { state?: string }).state }));
        const { error } = await supabase.from("messages").upsert(
          { conversation_id: conversation.id, ui_id: responseMessage.id, role: "assistant", content: text, parts, source_references: sources },
          { onConflict: "conversation_id,ui_id" },
        );
        if (error) console.error("failed to persist assistant message:", error.code);
      },
    }),
  });
}
