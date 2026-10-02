import { unzipSync, strFromU8 } from "fflate";
import { looksBinary, sanitizePath, skipReason, type SkipReason } from "./filters";

export type ExtractedFile = { path: string; content: string; size: number };

export type ExtractLimits = { maxFiles: number; maxTotalBytes: number };

export type ExtractResult = {
  files: ExtractedFile[];
  skipped: Partial<Record<SkipReason | "limit", number>>;
  truncated: boolean;
};

export class ArchiveError extends Error {}

/**
 * Safely extracts text files from a ZIP archive held in memory. Nothing is written to disk
 * and nothing is executed. Entries are filtered before decompression where possible so that
 * ignored directories and oversized files never get inflated.
 */
export function extractArchive(zip: Uint8Array, limits: ExtractLimits): ExtractResult {
  if (zip.length < 4 || zip[0] !== 0x50 || zip[1] !== 0x4b) throw new ArchiveError("The file is not a valid ZIP archive.");

  const skipped: ExtractResult["skipped"] = {};
  const bump = (r: SkipReason | "limit") => (skipped[r] = (skipped[r] ?? 0) + 1);
  let accepted = 0;
  let declaredTotal = 0;
  let truncated = false;

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zip, {
      filter(file) {
        if (file.name.endsWith("/")) return false;
        const path = sanitizePath(file.name);
        if (!path) {
          bump("unsafe_path");
          return false;
        }
        const reason = skipReason(path, file.originalSize);
        if (reason) {
          bump(reason);
          return false;
        }
        if (accepted >= limits.maxFiles || declaredTotal + file.originalSize > limits.maxTotalBytes) {
          truncated = true;
          bump("limit");
          return false;
        }
        accepted++;
        declaredTotal += file.originalSize;
        return true;
      },
    });
  } catch {
    throw new ArchiveError("The ZIP archive is corrupted or uses an unsupported compression method.");
  }

  const raw: { path: string; bytes: Uint8Array }[] = [];
  let actualTotal = 0;
  for (const [name, bytes] of Object.entries(entries)) {
    const path = sanitizePath(name)!;
    actualTotal += bytes.length;
    // Defends against headers that under-report the uncompressed size (zip bombs).
    if (actualTotal > limits.maxTotalBytes * 1.1) throw new ArchiveError("The archive expands beyond the allowed size.");
    if (skipReason(path, bytes.length) === "too_large") {
      bump("too_large");
      continue;
    }
    if (looksBinary(bytes)) {
      bump("binary");
      continue;
    }
    raw.push({ path, bytes });
  }

  const root = commonRoot(raw.map((f) => f.path));
  const files = raw.map(({ path, bytes }) => ({
    path: root ? path.slice(root.length + 1) : path,
    content: strFromU8(bytes).replace(/\r\n/g, "\n"),
    size: bytes.length,
  }));
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files, skipped, truncated };
}

/** GitHub zipballs (and many hand-made archives) wrap everything in one top-level folder. */
export function commonRoot(paths: string[]): string | null {
  if (paths.length === 0) return null;
  const first = paths[0].split("/")[0];
  if (!paths.every((p) => p.includes("/") && p.split("/")[0] === first)) return null;
  return first;
}
