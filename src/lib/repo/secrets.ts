/** Redacts likely credentials from source text before it is stored or sent to an LLM. */

const RULES: { name: string; re: RegExp }[] = [
  { name: "private-key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { name: "aws-access-key", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { name: "github-token", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{50,}\b/g },
  { name: "slack-token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: "google-api-key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: "stripe-key", re: /\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,}\b/g },
  { name: "api-key", re: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { name: "jwt", re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
];

const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s:/@]+:[^\s@/]+@/gi;

// key = "value" assignments for sensitive-looking names
const ASSIGNMENT =
  /\b([A-Za-z0-9_]*(?:secret|password|passwd|api[_-]?key|access[_-]?key|auth[_-]?token|private[_-]?key|client[_-]?secret)[A-Za-z0-9_]*)(\s*(?:[:=]|=>)\s*)(["'`])([^"'`\n]{8,})\3/gi;

const PLACEHOLDER = /^(process\.env|os\.environ|\$\{|<|your[-_ ]|xxx|changeme|example|placeholder|\*+$)/i;

export function redactSecrets(text: string): { text: string; redactions: number } {
  let redactions = 0;
  let out = text;
  for (const { name, re } of RULES) {
    out = out.replace(re, () => {
      redactions++;
      return `[REDACTED:${name}]`;
    });
  }
  out = out.replace(URL_CREDENTIALS, (_m, scheme: string) => {
    redactions++;
    return `${scheme}[REDACTED]@`;
  });
  out = out.replace(ASSIGNMENT, (match, key: string, op: string, quote: string, value: string) => {
    if (PLACEHOLDER.test(value) || value.startsWith("[REDACTED")) return match;
    redactions++;
    return `${key}${op}${quote}[REDACTED]${quote}`;
  });
  return { text: out, redactions };
}
