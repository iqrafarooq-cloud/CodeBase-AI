"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageSquare, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/primitives";
import { cn, formatRelative } from "@/lib/utils";

export type ConversationItem = { id: string; title: string; updated_at: string };

export function ConversationList({
  repositoryId,
  conversations,
  activeId,
  onChange,
}: {
  repositoryId: string;
  conversations: ConversationItem[];
  activeId: string | null;
  onChange: (c: ConversationItem[]) => void;
}) {
  const router = useRouter();
  const [renaming, setRenaming] = useState<ConversationItem | null>(null);
  const [title, setTitle] = useState("");
  const base = `/repositories/${repositoryId}/chat`;

  async function rename() {
    if (!renaming) return;
    const res = await fetch(`/api/conversations/${renaming.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }) });
    if (!res.ok) return toast.error("Could not rename the conversation.");
    onChange(conversations.map((c) => (c.id === renaming.id ? { ...c, title } : c)));
    setRenaming(null);
  }

  async function remove(id: string) {
    const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Could not delete the conversation.");
    onChange(conversations.filter((c) => c.id !== id));
    if (id === activeId) router.push(base);
  }

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border md:flex">
      <div className="p-3">
        <Button variant="secondary" size="sm" className="w-full justify-start" asChild>
          <Link href={base}>
            <Plus /> New chat
          </Link>
        </Button>
      </div>
      <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {conversations.length === 0 && <li className="px-2 py-4 text-center text-xs text-muted-foreground">No conversations yet</li>}
        {conversations.map((c) => (
          <li key={c.id} className={cn("group flex items-center rounded-md", c.id === activeId ? "bg-accent" : "hover:bg-muted")}>
            <Link href={`${base}?c=${c.id}`} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2">
              <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block truncate text-sm">{c.title}</span>
                <span className="block text-[11px] text-muted-foreground">{formatRelative(c.updated_at)}</span>
              </span>
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="mr-1 rounded p-1 text-muted-foreground opacity-0 hover:bg-background group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100" aria-label="Conversation actions">
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  onSelect={() => {
                    setTitle(c.title);
                    setRenaming(c);
                  }}
                >
                  <Pencil /> Rename
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onSelect={() => remove(c.id)}>
                  <Trash2 className="!text-destructive" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        ))}
      </ul>
      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent title="Rename conversation">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void rename();
            }}
            className="space-y-4"
          >
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} autoFocus aria-label="Conversation title" />
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="ghost" type="button">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={!title.trim()}>Save</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
