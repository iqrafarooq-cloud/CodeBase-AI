import { describe, expect, it } from "vitest";
import { canonicalGithubUrl, githubUrlSchema, parseGithubUrl } from "@/lib/repo/github";

describe("parseGithubUrl", () => {
  it.each([
    ["https://github.com/vercel/next.js", { owner: "vercel", repo: "next.js" }],
    ["https://github.com/vercel/next.js.git", { owner: "vercel", repo: "next.js" }],
    ["http://www.github.com/a-b/c_d/", { owner: "a-b", repo: "c_d" }],
    ["github.com/owner/repo", { owner: "owner", repo: "repo" }],
    ["owner/repo", { owner: "owner", repo: "repo" }],
    ["https://github.com/owner/repo/tree/feature/x", { owner: "owner", repo: "repo", ref: "feature/x" }],
  ])("accepts %s", (input, expected) => {
    expect(parseGithubUrl(input)).toEqual(expected);
  });

  it.each([
    "",
    "not a url",
    "https://gitlab.com/owner/repo",
    "https://github.com.evil.com/owner/repo",
    "https://user:pass@github.com/owner/repo",
    "https://github.com/owner",
    "https://github.com/owner/repo/issues/1",
    "https://github.com/owner/..",
    "ftp://github.com/owner/repo",
    "https://github.com:8443/owner/repo",
    "https://github.com/owner/repo/tree/../../etc",
  ])("rejects %s", (input) => {
    expect(parseGithubUrl(input)).toBeNull();
  });

  it("canonicalizes", () => {
    expect(canonicalGithubUrl({ owner: "a", repo: "b" })).toBe("https://github.com/a/b");
  });

  it("schema reports a helpful message", () => {
    const r = githubUrlSchema.safeParse("https://example.com/x/y");
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toMatch(/valid GitHub repository URL/);
  });
});
