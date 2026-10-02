import { describe, expect, it } from "vitest";
import { redactSecrets } from "@/lib/repo/secrets";

describe("redactSecrets", () => {
  it("redacts well-known credential formats", () => {
    const input = [
      "const aws = 'AKIAABCDEFGHIJKLMNOP';",
      "token: ghp_abcdefghijklmnopqrstuvwxyz0123456789AB",
      "-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----",
      "postgres://admin:hunter22@db.example.com:5432/app",
      "key = sk-ant-REDACTMEabcdefghijklmnopqrstuv",
    ].join("\n");
    const { text, redactions } = redactSecrets(input);
    expect(text).not.toContain("AKIAABCDEFGHIJKLMNOP");
    expect(text).not.toContain("ghp_abcdefghijklmnop");
    expect(text).not.toContain("MIIEow");
    expect(text).not.toContain("hunter22");
    expect(text).not.toContain("sk-ant-REDACTME");
    expect(redactions).toBeGreaterThanOrEqual(5);
  });

  it("redacts hard-coded secret assignments but keeps env lookups", () => {
    const { text } = redactSecrets(`const apiKey = "abcd1234efgh5678";\nconst dbPassword = process.env.DB_PASSWORD;\nconst clientSecret = "process.env.X";`);
    expect(text).toContain('apiKey = "[REDACTED]"');
    expect(text).toContain("process.env.DB_PASSWORD");
    expect(text).toContain('"process.env.X"');
  });

  it("leaves ordinary code untouched", () => {
    const code = "export function add(a: number, b: number) {\n  return a + b;\n}\n";
    expect(redactSecrets(code)).toEqual({ text: code, redactions: 0 });
  });
});
