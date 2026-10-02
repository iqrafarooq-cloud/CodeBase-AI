"use client";

import type { BundledLanguage, HighlighterGeneric, BundledTheme } from "shiki";

let highlighterPromise: Promise<HighlighterGeneric<BundledLanguage, BundledTheme>> | null = null;
const loaded = new Set<string>();

const ALIASES: Record<string, string> = {
  ts: "typescript", js: "javascript", py: "python", sh: "shellscript", bash: "shellscript", shell: "shellscript",
  yml: "yaml", md: "markdown", text: "plaintext", txt: "plaintext", dotenv: "dotenv", "": "plaintext",
};

/** Lazily loads Shiki in the browser and only the grammars actually used. */
export async function highlight(code: string, language: string, opts: { highlightLines?: { start: number; end: number } | null } = {}) {
  const { createHighlighter, bundledLanguages } = await import("shiki");
  highlighterPromise ??= createHighlighter({ themes: ["github-light", "github-dark-dimmed"], langs: [] });
  const hl = await highlighterPromise;
  let lang = ALIASES[language] ?? language;
  if (!(lang in bundledLanguages)) lang = "plaintext";
  if (lang !== "plaintext" && !loaded.has(lang)) {
    await hl.loadLanguage(lang as BundledLanguage);
    loaded.add(lang);
  }
  const range = opts.highlightLines;
  return hl.codeToHtml(code, {
    lang,
    themes: { light: "github-light", dark: "github-dark-dimmed" },
    defaultColor: "light",
    transformers: range
      ? [
          {
            line(node, line) {
              if (line >= range.start && line <= range.end) this.addClassToHast(node, "highlighted");
              node.properties["data-line"] = line;
            },
          },
        ]
      : [
          {
            line(node, line) {
              node.properties["data-line"] = line;
            },
          },
        ],
  });
}
