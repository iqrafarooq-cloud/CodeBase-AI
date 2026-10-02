"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { AlertTriangle, ArrowUp, Bot, KeyRound, Loader2, MessageSquarePlus, Sparkles, Square, User } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, Textarea } from "@/components/ui/primitives";
import { CopyButton } from "@/components/code/code-block";
import { Markdown } from "@/components/code/markdown";
import { extractSources } from "@/lib/citations";
import type { SourceReference } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ConversationList, type ConversationItem } from "./conversation-list";
import { SourceList } from "./source-list";
import { ToolSteps } from "./tool-steps";

export type InitialMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources: SourceReference[];
  tools: string[];
  createdAt: string;
};

const SUGGESTIONS = [
  "Explain this project to me.",
  "Which files should I read first?",
  "Explain the application's entry point.",
  "How does authentication work?",
  "Trace a request from the frontend to the backend.",
  "Explain the main API routes.",
  "Which modules are most important?",
  "Generate my onboarding roadmap.",
];

type Meta = { createdAt?: number | string; sources?: SourceReference[]; tools?: string[] };

// Only the newest message is sent; the server loads earlier turns from the database.
const transport = new DefaultChatTransport<UIMessage<Meta>>({
  api: "/api/chat",
  prepareSendMessagesRequest: ({ messages, body }) => ({
    body: { ...body, message: messages[messages.length - 1] },
  }),
});

function errorMessage(error: Error | undefined) {
  if (!error) return null;
  try {
    const parsed = JSON.parse(error.message);
    return parsed?.error?.message ?? error.message;
  } catch {
    if (/failed to fetch|network/i.test(error.message)) return "Network connection lost. Check your connection and retry.";
    return error.message || "The assistant could not respond.";
  }
}

export function ChatClient({
  repositoryId,
  repositoryName,
  conversations: initialConversations,
  conversationId: initialConversationId,
  initialMessages,
  initialQuestion,
  aiConfigured,
}: {
  repositoryId: string;
  repositoryName: string;
  conversations: ConversationItem[];
  conversationId: string | null;
  initialMessages: InitialMessage[];
  initialQuestion: string | null;
  aiConfigured: boolean;
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [input, setInput] = useState("");
  const [creating, setCreating] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const autoAsked = useRef(false);

  const { messages, sendMessage, status, stop, error, regenerate, clearError } = useChat<UIMessage<Meta>>({
    id: initialConversationId ?? undefined,
    transport,
    messages: initialMessages.map((m) => ({
      id: m.id,
      role: m.role,
      parts: [{ type: "text", text: m.text }],
      metadata: { createdAt: m.createdAt, sources: m.sources, tools: m.tools },
    })),
    onFinish: () => {
      const id = conversationId;
      setConversations((cs) => {
        const current = cs.find((c) => c.id === id);
        return current ? [{ ...current, updated_at: new Date().toISOString() }, ...cs.filter((c) => c.id !== id)] : cs;
      });
    },
  });

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  async function ensureConversation(firstQuestion: string) {
    if (conversationId) return conversationId;
    setCreating(true);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repositoryId }),
      });
      if (!res.ok) throw new Error();
      const conv = (await res.json()) as ConversationItem;
      setConversationId(conv.id);
      setConversations((cs) => [{ ...conv, title: firstQuestion.slice(0, 80) }, ...cs]);
      window.history.replaceState(null, "", `/repositories/${repositoryId}/chat?c=${conv.id}`);
      return conv.id;
    } finally {
      setCreating(false);
    }
  }

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy || creating) return;
    let id: string;
    try {
      id = await ensureConversation(q);
    } catch {
      toast.error("Could not start a conversation. Please retry.");
      return;
    }
    setInput("");
    clearError();
    void sendMessage({ text: q, metadata: { createdAt: Date.now() } }, { body: { conversationId: id } });
  }

  useEffect(() => {
    if (initialQuestion && !autoAsked.current && aiConfigured) {
      autoAsked.current = true;
      void ask(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once for ?q= deep links
  }, []);

  const lastIsUser = messages.length > 0 && messages[messages.length - 1].role === "user";

  return (
    <div className="flex h-[calc(100dvh-13rem)] min-h-[480px] overflow-hidden rounded-xl border border-border bg-card">
      <ConversationList
        repositoryId={repositoryId}
        conversations={conversations}
        activeId={conversationId}
        onChange={setConversations}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-6 sm:px-8" aria-live="polite">
          {!aiConfigured && (
            <div className="mx-auto mb-6 flex max-w-3xl items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
              <KeyRound className="mt-0.5 size-4 shrink-0 text-warning" />
              <p>The AI provider is not configured on the server. Set <code className="font-mono">ANTHROPIC_API_KEY</code> or <code className="font-mono">GROQ_API_KEY</code> to enable the assistant. Repository analysis, the code explorer and architecture views still work.</p>
            </div>
          )}
          {messages.length === 0 ? (
            <div className="mx-auto max-w-2xl pt-6">
              <EmptyState
                icon={Sparkles}
                title={`Ask anything about ${repositoryName}`}
                description="The assistant searches the indexed source code with tools and cites the files and lines it used."
                className="border-none py-6"
              />
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => ask(s)}
                    disabled={!aiConfigured || busy}
                    className="rounded-lg border border-border px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6">
              {messages.map((m, i) => (
                <ChatMessage key={m.id} message={m} repositoryId={repositoryId} streaming={busy && i === messages.length - 1} onAsk={ask} />
              ))}
              {status === "submitted" && lastIsUser && (
                <div className="flex items-center gap-2 pl-10 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Thinking…
                </div>
              )}
              {error && (
                <div role="alert" className="ml-10 flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/8 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" /> {errorMessage(error)}</span>
                  <Button size="sm" variant="outline" onClick={() => regenerate({ body: { conversationId } })}>Retry</Button>
                </div>
              )}
            </div>
          )}
        </div>

        <form
          className="border-t border-border p-3 sm:p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
        >
          <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-xl border border-input bg-background p-2 focus-within:border-ring">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void ask(input);
                }
              }}
              placeholder={aiConfigured ? `Ask about ${repositoryName}…` : "AI provider not configured"}
              disabled={!aiConfigured}
              rows={1}
              maxLength={4000}
              className="max-h-40 min-h-9 resize-none border-0 px-2 py-1.5 focus-visible:outline-none"
              aria-label="Message"
            />
            {busy ? (
              <Button type="button" size="icon-sm" variant="secondary" onClick={() => stop()} aria-label="Stop generating">
                <Square className="fill-current" />
              </Button>
            ) : (
              <Button type="submit" size="icon-sm" disabled={!input.trim() || !aiConfigured || creating} aria-label="Send message">
                {creating ? <Loader2 className="animate-spin" /> : <ArrowUp />}
              </Button>
            )}
          </div>
          <p className="mx-auto mt-1.5 max-w-3xl text-center text-[11px] text-muted-foreground">Answers are grounded in indexed code. Verify citations before acting on them.</p>
        </form>
      </div>
    </div>
  );
}

function ChatMessage({ message, repositoryId, streaming, onAsk }: { message: UIMessage<Meta>; repositoryId: string; streaming: boolean; onAsk: (q: string) => void }) {
  const text = message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n\n");
  const toolParts = message.parts.filter((p) => p.type.startsWith("tool-")) as unknown as { type: string; state: string; input?: Record<string, unknown> }[];
  const sources = useMemo(
    () => (toolParts.length ? extractSources(message.parts as { type: string; state?: string; output?: unknown }[]) : message.metadata?.sources ?? []),
    [message.parts, message.metadata, toolParts.length],
  );
  const knownPaths = useMemo(() => new Set(sources.map((s) => s.path)), [sources]);
  const created = message.metadata?.createdAt ? new Date(message.metadata.createdAt) : null;
  const isUser = message.role === "user";

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className="group flex gap-3" data-testid={`message-${message.role}`}>
      <div className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", isUser ? "bg-muted" : "bg-gradient-to-br from-primary to-violet text-white")}>
        {isUser ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{isUser ? "You" : "CodeBase AI"}</span>
          {created && <time dateTime={created.toISOString()}>{created.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>}
        </div>
        {!isUser && <ToolSteps parts={toolParts} savedTools={message.metadata?.tools} />}
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm">{text}</p>
        ) : text ? (
          <Markdown text={text} repositoryId={repositoryId} knownPaths={knownPaths} />
        ) : null}
        {!isUser && !streaming && (
          <>
            <SourceList sources={sources} repositoryId={repositoryId} />
            {text && (
              <div className="mt-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <CopyButton text={text} label="Copy response" />
                <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => onAsk("Can you go deeper on that, with more code references?")}>
                  <MessageSquarePlus className="size-3.5" /> Go deeper
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
