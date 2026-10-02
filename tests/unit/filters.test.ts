import { describe, expect, it } from "vitest";
import { looksBinary, sanitizePath, skipReason, MAX_FILE_BYTES } from "@/lib/repo/filters";

describe("sanitizePath (path traversal protection)", () => {
  it.each([
    ["src/index.ts", "src/index.ts"],
    ["./src//a/./b.ts", "src/a/b.ts"],
    ["repo-abc\\src\\x.ts", "repo-abc/src/x.ts"],
  ])("normalizes %s", (input, expected) => expect(sanitizePath(input)).toBe(expected));

  it.each(["../etc/passwd", "a/../../b", "/etc/passwd", "C:/Windows/x", "c:\\x", "a\0b", "", "./"])("rejects %s", (input) => {
    expect(sanitizePath(input)).toBeNull();
  });
});

describe("skipReason (file filtering)", () => {
  it.each([
    ["node_modules/react/index.js", "ignored_dir"],
    ["packages/app/node_modules/x/y.js", "ignored_dir"],
    [".git/config", "ignored_dir"],
    ["dist/bundle.js", "ignored_dir"],
    [".next/server/app.js", "ignored_dir"],
    [".env", "secret"],
    ["apps/web/.env.local", "secret"],
    ["certs/server.pem", "secret"],
    ["id_rsa", "secret"],
    [".npmrc", "secret"],
    ["config/service-account-prod.json", "secret"],
    ["logo.png", "binary"],
    ["fonts/inter.woff2", "binary"],
    ["package-lock.json", "generated"],
    ["public/app.min.js", "generated"],
  ])("%s -> %s", (path, reason) => expect(skipReason(path, 100)).toBe(reason));

  it("keeps normal source and env templates", () => {
    expect(skipReason("src/app/page.tsx", 100)).toBeNull();
    expect(skipReason(".env.example", 100)).toBeNull();
    expect(skipReason("README.md", 100)).toBeNull();
  });

  it("skips oversized files", () => {
    expect(skipReason("src/huge.ts", MAX_FILE_BYTES + 1)).toBe("too_large");
  });
});

describe("looksBinary", () => {
  it("detects NUL bytes", () => expect(looksBinary(new Uint8Array([65, 0, 66]))).toBe(true));
  it("accepts text", () => expect(looksBinary(new TextEncoder().encode("const a = 1;\n"))).toBe(false));
});
