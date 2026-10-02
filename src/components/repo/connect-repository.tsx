"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileArchive, GitBranch, Loader2, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, Input, Label, Progress } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/client";
import { parseGithubUrl } from "@/lib/repo/github";
import { cn, formatBytes } from "@/lib/utils";

const MAX_ZIP_BYTES = 50 * 1024 * 1024;

async function apiError(res: Response) {
  try {
    const body = await res.json();
    return body?.error?.message ?? "Request failed.";
  } catch {
    return res.status === 0 ? "Network connection lost." : "Request failed.";
  }
}

export function ConnectRepository() {
  const [tab, setTab] = useState<"github" | "zip">("github");
  return (
    <Card className="p-5">
      <div role="tablist" className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {(
          [
            ["github", "GitHub URL", GitBranch],
            ["zip", "Upload ZIP", Upload],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn("flex items-center justify-center gap-2 rounded-md py-1.5 text-sm transition-colors", tab === key ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>
      {tab === "github" ? <GithubForm /> : <ZipForm />}
      <p className="mt-5 flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
        node_modules, .git, build artifacts, binaries, .env files and keys are ignored. Remaining secrets are redacted before anything is stored or sent to the AI model.
      </p>
    </Card>
  );
}

function GithubForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = parseGithubUrl(url) !== null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) {
      setError("Enter a valid GitHub repository URL, e.g. https://github.com/vercel/swr");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/repositories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
      if (!res.ok) throw new Error(await apiError(res));
      const { id, existing } = await res.json();
      if (existing) toast.info("This repository is already connected.");
      else toast.success("Repository connected - analysis started.");
      router.push(`/repositories/${id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="repo-url">Public repository URL</Label>
        <Input id="repo-url" placeholder="https://github.com/owner/repository" value={url} onChange={(e) => setUrl(e.target.value)} autoFocus aria-invalid={Boolean(error)} />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending || !url.trim()}>
        {pending && <Loader2 className="animate-spin" />} Import and analyze
      </Button>
      <p className="text-xs text-muted-foreground">Public repositories work without any GitHub authorization. Private repository access is not enabled in this version.</p>
    </form>
  );
}

function ZipForm() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [stage, setStage] = useState<"idle" | "uploading" | "registering">("idle");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function pick(f: File | undefined) {
    setError(null);
    if (!f) return;
    if (!/\.zip$/i.test(f.name)) return setError("Please choose a .zip file.");
    if (f.size > MAX_ZIP_BYTES) return setError(`The archive is ${formatBytes(f.size)}; the limit is ${formatBytes(MAX_ZIP_BYTES)}.`);
    setFile(f);
    if (!name) setName(f.name.replace(/\.zip$/i, "").replace(/[^\w .-]/g, "-").slice(0, 100));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setStage("uploading");
    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Your session has expired. Please sign in again.");
      const path = `${auth.user.id}/${crypto.randomUUID()}.zip`;
      const { error: upErr } = await supabase.storage.from("repo-archives").upload(path, file, { contentType: "application/zip", upsert: false });
      if (upErr) throw new Error("Upload failed. Please try again.");
      setStage("registering");
      const res = await fetch("/api/repositories/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, storagePath: path }),
      });
      if (!res.ok) throw new Error(await apiError(res));
      const { id } = await res.json();
      toast.success("Archive uploaded - analysis started.");
      router.push(`/repositories/${id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setStage("idle");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files[0]);
        }}
        onClick={() => input.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-10 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
        )}
      >
        <FileArchive className="mb-2 size-6 text-muted-foreground" />
        {file ? (
          <p className="text-sm font-medium">{file.name} <span className="font-normal text-muted-foreground">({formatBytes(file.size)})</span></p>
        ) : (
          <>
            <p className="text-sm font-medium">Drop a .zip here or click to browse</p>
            <p className="mt-1 text-xs text-muted-foreground">Up to {formatBytes(MAX_ZIP_BYTES)}</p>
          </>
        )}
        <input ref={input} type="file" accept=".zip,application/zip" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} data-testid="zip-input" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="repo-name">Project name</Label>
        <Input id="repo-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
      </div>
      {stage !== "idle" && (
        <div className="space-y-1.5">
          <Progress value={stage === "uploading" ? 45 : 90} />
          <p className="text-xs text-muted-foreground">{stage === "uploading" ? "Uploading archive…" : "Starting analysis…"}</p>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={!file || !name.trim() || stage !== "idle"}>
        {stage !== "idle" && <Loader2 className="animate-spin" />} Upload and analyze
      </Button>
    </form>
  );
}
