"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MoreHorizontal, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dialog";
import type { AnalysisStatus } from "@/lib/types";

export async function startAnalysis(id: string, force: boolean) {
  const res = await fetch(`/api/repositories/${id}/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ force }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Could not start analysis.");
  }
}

export function RepoActions({ id, status }: { id: string; status: AnalysisStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function reanalyze(force: boolean) {
    setBusy(true);
    try {
      await startAnalysis(id, force);
      toast.success(force ? "Re-indexing started." : "Checking for changes…");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start analysis.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    const res = await fetch(`/api/repositories/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) return toast.error("Could not delete the repository.");
    toast.success("Repository deleted.");
    router.push("/repositories");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => reanalyze(false)} disabled={busy || status === "processing"}>
        {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="More repository actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem disabled={status === "processing"} onSelect={() => reanalyze(true)}>
            <RefreshCw /> Force full re-index
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onSelect={() => setConfirmDelete(true)}>
            <Trash2 className="!text-destructive" /> Delete repository
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent title="Delete repository?" description="This removes the analysis, code index, conversations and roadmap for this repository. This cannot be undone.">
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={remove} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
