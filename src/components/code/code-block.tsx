"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { highlight } from "./highlight";

export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className ?? "flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      aria-label={label}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function CodeBlock({ code, language }: { code: string; language: string }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    highlight(code, language)
      .then((h) => alive && setHtml(h))
      .catch(() => alive && setHtml(null));
    return () => {
      alive = false;
    };
  }, [code, language]);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-code">
      <div className="flex items-center justify-between border-b border-border px-3 py-1">
        <span className="font-mono text-[11px] text-muted-foreground">{language || "text"}</span>
        <CopyButton text={code} />
      </div>
      {html ? (
        <div className="shiki-host px-3" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre className="overflow-x-auto px-3 py-3 font-mono text-[12.5px] leading-relaxed">{code}</pre>
      )}
    </div>
  );
}
