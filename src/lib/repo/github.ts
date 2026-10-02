import { z } from "zod";

const SEGMENT = /^[A-Za-z0-9_.-]{1,100}$/;

export type GithubRef = { owner: string; repo: string; ref?: string };

/** Parses https://github.com/owner/repo[.git][/tree/branch] and the owner/repo shorthand. */
export function parseGithubUrl(input: string): GithubRef | null {
  const raw = input.trim();
  if (!raw || raw.length > 300) return null;
  // Reject dot segments before URL parsing silently resolves them to a different path.
  if (/(^|[/\\])\.\.?([/\\]|$)/.test(raw.replace(/^https?:\/\//i, ""))) return null;
  let path: string;
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(raw)) {
    path = raw;
  } else {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      return null;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!["github.com", "www.github.com"].includes(url.hostname.toLowerCase())) return null;
    if (url.username || url.password || url.port) return null;
    path = url.pathname.replace(/^\/+|\/+$/g, "");
  }
  const parts = path.split("/");
  if (parts.length < 2) return null;
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, "");
  if (!SEGMENT.test(owner) || !SEGMENT.test(repo) || repo === "." || repo === "..") return null;
  if (parts.length === 2) return { owner, repo };
  if (parts[2] === "tree" && parts.length > 3) {
    const ref = parts.slice(3).join("/");
    if (!/^[A-Za-z0-9._/-]{1,200}$/.test(ref) || ref.includes("..")) return null;
    return { owner, repo, ref };
  }
  return null;
}

export const githubUrlSchema = z
  .string()
  .trim()
  .min(1, "Repository URL is required")
  .refine((v) => parseGithubUrl(v) !== null, "Enter a valid GitHub repository URL, e.g. https://github.com/vercel/swr");

export function canonicalGithubUrl(ref: Pick<GithubRef, "owner" | "repo">) {
  return `https://github.com/${ref.owner}/${ref.repo}`;
}
