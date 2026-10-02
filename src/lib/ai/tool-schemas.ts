import { z } from "zod";

/** Agent tool input schemas. Kept separate from execution so they can be unit tested. */

const repoPath = z
  .string()
  .trim()
  .min(1)
  .max(400)
  .refine((p) => !p.includes("..") && !p.startsWith("/") && !p.includes("\0"), "Path must be relative to the repository root")
  .transform((p) => p.replace(/^\.\//, ""));

export const searchCodeInput = z.object({
  query: z.string().trim().min(2).max(300).describe("What to look for: a concept, symbol name, file name or text."),
  limit: z.number().int().min(1).max(12).default(8),
});

export const explainFileInput = z.object({
  path: repoPath.describe("Repository-relative file path, exactly as seen in search results."),
  startLine: z.number().int().min(1).optional(),
  endLine: z.number().int().min(1).optional(),
});

export const traceWorkflowInput = z.object({
  feature: z.string().trim().min(3).max(300).describe('The feature or workflow to trace, e.g. "user login" or "checkout".'),
});

export const analyzeRepositoryInput = z.object({
  aspect: z.enum(["overview", "technology", "structure", "dependencies", "routes", "documentation"]).default("overview"),
});

export const generateArchitectureInput = z.object({
  focus: z.string().trim().max(100).optional().describe("Optional node or layer to focus on, e.g. 'api' or 'auth'."),
});

export const generateRoadmapInput = z.object({
  confirm: z.literal(true).describe("Must be true. Only call when the user explicitly asks to create or regenerate a roadmap."),
});

export const findEntryPointsInput = z.object({});
