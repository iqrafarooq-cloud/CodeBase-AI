import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const { getOwnedRepository } = await import("@/lib/auth");
const { deterministicRoadmap } = await import("@/lib/ai/roadmap");

/** Minimal query-builder fake that records filters. */
function fakeSupabase(row: unknown) {
  const filters: [string, unknown][] = [];
  const builder = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      filters.push([col, val]);
      return builder;
    },
    maybeSingle: async () => ({ data: row }),
  };
  return { client: { from: vi.fn(() => builder) }, filters };
}

describe("repository ownership checks", () => {
  const id = "11111111-2222-3333-4444-555555555555";

  it("always filters by the session user id as well as the repository id", async () => {
    const { client, filters } = fakeSupabase({ id, user_id: "user-a" });
    const repo = await getOwnedRepository(client as never, "user-a", id);
    expect(repo).toMatchObject({ id });
    expect(filters).toEqual([
      ["id", id],
      ["user_id", "user-a"],
    ]);
  });

  it("returns null when the row is not visible to the user", async () => {
    const { client } = fakeSupabase(null);
    expect(await getOwnedRepository(client as never, "user-b", id)).toBeNull();
  });

  it("rejects malformed ids without querying", async () => {
    const { client } = fakeSupabase({ id });
    expect(await getOwnedRepository(client as never, "user-a", "../../etc")).toBeNull();
    expect(client.from).not.toHaveBeenCalled();
  });
});

describe("deterministic roadmap", () => {
  const facts = {
    entryPoints: [{ path: "src/app/page.tsx", reason: "home" }],
    directories: [],
    importantFiles: [
      { path: "README.md", reason: "Project README" },
      { path: "src/lib/db.ts", reason: "Imported by 5 file(s)" },
    ],
    configFiles: ["package.json", ".env.example", "vitest.config.ts"],
    routes: [{ path: "src/app/api/users/route.ts", route: "/api/users", kind: "api" as const }],
    docs: { readme: "# x", markdownFiles: 1, codeFiles: 4, filesWithDocComments: 1 },
    skipped: {},
    parseFailures: [],
    truncated: false,
  };
  const paths = ["README.md", "package.json", ".env.example", "src/app/page.tsx", "src/lib/db.ts", "src/app/api/users/route.ts", "tests/db.test.ts"];

  it("references only files that exist and scales durations by experience", () => {
    const beginner = deterministicRoadmap("demo", { summary: {}, facts, technology_stack: [] }, { experience_level: "beginner", developer_role: "backend", learning_goal: "Fix bugs", learning_style: null, display_name: null, weekly_hours: null }, paths);
    const advanced = deterministicRoadmap("demo", { summary: {}, facts, technology_stack: [] }, { experience_level: "advanced", developer_role: "backend", learning_goal: null, learning_style: null, display_name: null, weekly_hours: null }, paths);
    const all = beginner.tasks.flatMap((t) => t.relevantFiles);
    expect(all.length).toBeGreaterThan(0);
    for (const p of all) expect(paths).toContain(p);
    expect(beginner.tasks.some((t) => t.title.includes("Trace a request"))).toBe(true);
    expect(beginner.tasks.at(-1)!.description).toContain("Fix bugs");
    const total = (r: typeof beginner) => r.tasks.reduce((n, t) => n + t.estimatedMinutes, 0);
    expect(total(beginner)).toBeGreaterThan(total(advanced));
  });
});
