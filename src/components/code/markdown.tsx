"use client";

import { memo } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./code-block";
import { Mermaid } from "./mermaid";
import { explorerHref } from "@/lib/citations";

const CITATION = /^([\w@.$/[\]()-]+\.[\w]+):L(\d+)(?:-L?(\d+))?$/;

/**
 * Markdown renderer for assistant answers. Inline code that looks like a citation
 * (`path/file.ts:L10-L20`) becomes a link into the Code Explorer - but only when the path
 * was actually returned by a tool in this answer (`knownPaths`), so the model cannot link
 * to fabricated files.
 */
export const Markdown = memo(function Markdown({ text, repositoryId, knownPaths }: { text: string; repositoryId: string; knownPaths: Set<string> }) {
  return (
    <div className="prose-chat">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target={href?.startsWith("/") ? undefined : "_blank"} rel="noreferrer">
              {children}
            </a>
          ),
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children }) => {
            const content = String(children ?? "");
            const lang = /language-([\w-]+)/.exec(className ?? "")?.[1];
            if (lang === "mermaid") return <Mermaid chart={content.trim()} />;
            if (lang || content.includes("\n")) return <CodeBlock code={content.replace(/\n$/, "")} language={lang ?? "text"} />;
            const m = CITATION.exec(content.trim());
            if (m && knownPaths.has(m[1])) {
              const start = Number(m[2]);
              const end = m[3] ? Number(m[3]) : start;
              return (
                <Link href={explorerHref(repositoryId, { path: m[1], startLine: start, endLine: end })} className="no-underline">
                  <code className="text-primary hover:underline">{content}</code>
                </Link>
              );
            }
            return <code>{children}</code>;
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
