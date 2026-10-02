"use client";

import { useEffect, useId, useState } from "react";
import { useTheme } from "next-themes";
import { CodeBlock } from "./code-block";

/** Renders a Mermaid diagram with strict security; falls back to the source on parse errors. */
export function Mermaid({ chart }: { chart: string }) {
  const id = useId().replace(/:/g, "");
  const { resolvedTheme } = useTheme();
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: resolvedTheme === "light" ? "default" : "dark", fontFamily: "inherit" });
        const { svg } = await mermaid.render(`m${id}`, chart);
        if (alive) {
          setSvg(svg);
          setFailed(false);
        }
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [chart, id, resolvedTheme]);

  if (failed) return <CodeBlock code={chart} language="mermaid" />;
  if (!svg) return <div className="h-40 animate-pulse rounded-lg border border-border bg-muted/50" />;
  return <div className="overflow-x-auto rounded-lg border border-border bg-card p-4 [&_svg]:mx-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}
