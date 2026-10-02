import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { ArchiveError, commonRoot, extractArchive } from "@/lib/repo/archive";

const limits = { maxFiles: 100, maxTotalBytes: 1024 * 1024 };

function zip(entries: Record<string, string | Uint8Array>) {
  return zipSync(Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, typeof v === "string" ? strToU8(v) : v])));
}

describe("extractArchive", () => {
  it("extracts source, strips the single top-level folder and filters junk", () => {
    const result = extractArchive(
      zip({
        "proj-main/src/index.ts": "export const a = 1;\r\n",
        "proj-main/README.md": "# Hi",
        "proj-main/node_modules/x/index.js": "x",
        "proj-main/.env": "SECRET=1",
        "proj-main/logo.png": new Uint8Array([137, 80, 78, 71]),
        "proj-main/data.bin.txt": new Uint8Array([1, 0, 2, 3]),
      }),
      limits,
    );
    expect(result.files.map((f) => f.path)).toEqual(["README.md", "src/index.ts"]);
    expect(result.files.find((f) => f.path === "src/index.ts")!.content).toBe("export const a = 1;\n");
    expect(result.skipped).toMatchObject({ ignored_dir: 1, secret: 1, binary: 2 });
  });

  it("never extracts traversal paths", () => {
    const result = extractArchive(zip({ "../evil.ts": "x", "ok/../../evil2.ts": "x", "safe.ts": "y" }), limits);
    expect(result.files.map((f) => f.path)).toEqual(["safe.ts"]);
    expect(result.skipped.unsafe_path).toBe(2);
  });

  it("enforces file count limits", () => {
    const entries: Record<string, string> = {};
    for (let i = 0; i < 10; i++) entries[`f${i}.ts`] = "x";
    const result = extractArchive(zip(entries), { maxFiles: 3, maxTotalBytes: 1e6 });
    expect(result.files).toHaveLength(3);
    expect(result.truncated).toBe(true);
  });

  it("rejects non-zip input", () => {
    expect(() => extractArchive(strToU8("hello world"), limits)).toThrow(ArchiveError);
  });

  it("commonRoot only strips when every file shares it", () => {
    expect(commonRoot(["a/x", "a/y/z"])).toBe("a");
    expect(commonRoot(["a/x", "b/y"])).toBeNull();
    expect(commonRoot(["a/x", "root.txt"])).toBeNull();
  });
});
