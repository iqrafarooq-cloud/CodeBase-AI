import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { AiSummary } from "@/lib/types";
import type { DeterministicAnalysis } from "@/lib/repo/analyzer";
import { chatModel, UNTRUSTED_CONTENT_POLICY } from "./provider";

const summarySchema = z.object({
  purpose: z.string().describe("One or two sentences: what the project does and for whom."),
  overview: z.string().describe("A short paragraph describing how the codebase is organised."),
  keyModules: z
    .array(z.object({ path: z.string(), description: z.string() }))
    .max(10)
    .describe("Most important files or directories. Paths MUST be copied exactly from the provided list."),
  workflows: z
    .array(z.object({ name: z.string(), description: z.string(), files: z.array(z.string()).max(8) }))
    .max(6)
    .describe("Likely end-to-end workflows (e.g. sign-in, checkout). Only include workflows supported by the evidence."),
  documentationNotes: z.string().describe("Observations about documentation coverage and quality."),
});

/** LLM interpretation layered on top of deterministic facts. Paths are validated afterwards. */
export async function generateProjectSummary(name: string, analysis: DeterministicAnalysis): Promise<AiSummary> {
  const { facts, techStack, files } = analysis;
  const paths = new Set(files.map((f) => f.path));
  const tree = files.map((f) => f.path).slice(0, 400).join("\n");
  const excerptPaths = [...new Set([...facts.entryPoints.map((e) => e.path), ...facts.importantFiles.map((f) => f.path)])]
    .filter((p) => !/readme/i.test(p))
    .slice(0, 8);
  const excerpts = excerptPaths
    .map((p) => {
      const f = files.find((x) => x.path === p);
      return f ? `--- ${p} ---\n${f.content.split("\n").slice(0, 60).join("\n")}` : "";
    })
    .join("\n\n");

  const prompt = `Repository: ${name}

CONFIRMED FACTS (from static analysis):
Technology: ${techStack.map((t) => `${t.name} (${t.category})`).join(", ") || "unknown"}
Entry points: ${facts.entryPoints.map((e) => `${e.path} - ${e.reason}`).join("; ") || "none detected"}
Routes: ${facts.routes.slice(0, 40).map((r) => `${r.kind}:${r.route} (${r.path})`).join("; ") || "none detected"}
Directories: ${facts.directories.map((d) => `${d.path} (${d.files})`).join(", ")}
Docs: ${facts.docs.markdownFiles} markdown files, ${facts.docs.filesWithDocComments}/${facts.docs.codeFiles} code files contain doc comments.

FILE LIST (truncated):
${tree}

<untrusted_readme>
${facts.docs.readme?.slice(0, 4000) ?? "(no README)"}
</untrusted_readme>

<untrusted_source_excerpts>
${excerpts.slice(0, 20000)}
</untrusted_source_excerpts>

Write an onboarding-oriented summary for a developer new to this codebase. Only reference paths from the file list.`;

  const { output } = await generateText({
    model: chatModel(),
    system: `You analyse software repositories for developer onboarding. Be concrete and concise. If evidence is thin, say so instead of guessing.\n${UNTRUSTED_CONTENT_POLICY}`,
    prompt,
    output: Output.object({ schema: summarySchema }),
    maxRetries: 2,
    abortSignal: AbortSignal.timeout(90_000),
  });

  const validPath = (p: string) => paths.has(p) || files.some((f) => f.path.startsWith(p.replace(/\/$/, "") + "/"));
  return {
    ...output,
    keyModules: output.keyModules.filter((m) => validPath(m.path)),
    workflows: output.workflows.map((w) => ({ ...w, files: w.files.filter(validPath) })),
  };
}
