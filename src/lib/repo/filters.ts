/** Rules deciding which repository files are ingested. Pure functions, unit tested. */

const IGNORED_DIRS = new Set([
  "node_modules", ".git", ".hg", ".svn", "dist", "build", "out", ".next", ".nuxt", ".svelte-kit",
  ".turbo", ".vercel", ".cache", "coverage", "__pycache__", ".pytest_cache", ".mypy_cache", ".venv",
  "venv", ".tox", "target", "vendor", "bower_components", ".idea", ".vscode", ".gradle",
  "Pods", "DerivedData", ".terraform", "storybook-static", ".parcel-cache", ".expo", "site-packages",
  "__MACOSX",
]);

const SECRET_FILE_PATTERNS: RegExp[] = [
  /(^|\/)\.env(\..*)?$/i,
  /(^|\/)\.envrc$/i,
  /\.(pem|key|p12|pfx|jks|keystore|crt|cer|der|kdbx|ovpn)$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /(^|\/)\.(npmrc|pypirc|netrc|htpasswd|git-credentials)$/i,
  /(^|\/)credentials(\.json)?$/i,
  /(^|\/)secrets?\.(json|ya?ml|toml)$/i,
  /(^|\/)service[-_]?account[^/]*\.json$/i,
  /\.tfstate(\.backup)?$/i,
];

const ENV_TEMPLATE = /(^|\/)\.env\.(example|sample|template)$/i;

const BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|bmp|tiff?|svgz|psd|ai|mp[34]|mov|avi|webm|wav|ogg|flac|zip|gz|tgz|bz2|xz|7z|rar|tar|jar|war|class|so|dll|dylib|exe|bin|o|a|lib|wasm|pyc|pyo|woff2?|ttf|otf|eot|pdf|docx?|xlsx?|pptx?|sqlite3?|db|mdb|parquet|avro|onnx|pt|pth|h5|pkl|npy|npz|DS_Store)$/i;

const GENERATED_FILE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|poetry\.lock|Pipfile\.lock|Cargo\.lock|composer\.lock|Gemfile\.lock|go\.sum|next-env\.d\.ts)$|\.min\.(js|css)$|\.map$|\.snap$/i;

export type SkipReason = "ignored_dir" | "secret" | "binary" | "generated" | "too_large" | "unsafe_path";

export const MAX_FILE_BYTES = 512 * 1024;

/**
 * Normalises an archive entry path. Returns null for anything that could escape the
 * extraction root (absolute paths, drive letters, "..", NUL bytes).
 */
export function sanitizePath(raw: string): string | null {
  if (!raw || raw.includes("\0")) return null;
  const p = raw.replace(/\\/g, "/");
  if (p.startsWith("/") || /^[A-Za-z]:/.test(p)) return null;
  const out: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") return null;
    out.push(seg);
  }
  return out.length ? out.join("/") : null;
}

export function skipReason(path: string, size: number): SkipReason | null {
  const segments = path.split("/");
  if (segments.slice(0, -1).some((s) => IGNORED_DIRS.has(s))) return "ignored_dir";
  if (!ENV_TEMPLATE.test(path) && SECRET_FILE_PATTERNS.some((r) => r.test(path))) return "secret";
  if (BINARY_EXT.test(path)) return "binary";
  if (GENERATED_FILE.test(path)) return "generated";
  if (size > MAX_FILE_BYTES) return "too_large";
  return null;
}

/** Heuristic binary sniff: NUL byte or a high ratio of control characters in the first 8KB. */
export function looksBinary(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 8000);
  let control = 0;
  for (let i = 0; i < n; i++) {
    const b = bytes[i];
    if (b === 0) return true;
    if (b < 7 || (b > 13 && b < 32)) control++;
  }
  return n > 0 && control / n > 0.1;
}
