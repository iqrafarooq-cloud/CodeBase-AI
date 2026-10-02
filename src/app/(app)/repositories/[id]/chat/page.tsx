import { AnalysisGate } from "@/components/repo/analysis-gate";
import { ChatClient, type InitialMessage } from "@/components/chat/chat-client";
import { isAiConfigured } from "@/lib/env";
import { loadRepository } from "@/lib/repo-page";
import type { SourceReference } from "@/lib/types";

export const metadata = { title: "AI Codebase Chat" };

export default async function ChatPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ c?: string; q?: string }> }) {
  const { id } = await params;
  const { c, q } = await searchParams;
  const { repo, supabase, user, gate, ready } = await loadRepository(id);
  if (!ready) return <AnalysisGate id={repo.id} initial={gate} />;

  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, title, updated_at")
    .eq("user_id", user.id)
    .eq("repository_id", repo.id)
    .order("updated_at", { ascending: false })
    .limit(50);

  const active = (conversations ?? []).find((x) => x.id === c) ?? null;
  let messages: InitialMessage[] = [];
  if (active) {
    const { data } = await supabase
      .from("messages")
      .select("ui_id, role, content, source_references, parts, created_at")
      .eq("conversation_id", active.id)
      .order("created_at", { ascending: true })
      .limit(200);
    messages = (data ?? []).map((m) => ({
      id: m.ui_id,
      role: m.role,
      text: m.content,
      sources: (m.source_references ?? []) as SourceReference[],
      tools: ((m.parts ?? []) as { type: string }[]).filter((p) => p.type.startsWith("tool-")).map((p) => p.type.slice(5)),
      createdAt: m.created_at,
    }));
  }

  return (
    <ChatClient
      key={active?.id ?? "new"}
      repositoryId={repo.id}
      repositoryName={repo.name}
      conversations={conversations ?? []}
      conversationId={active?.id ?? null}
      initialMessages={messages}
      initialQuestion={!active ? q ?? null : null}
      aiConfigured={isAiConfigured()}
    />
  );
}
