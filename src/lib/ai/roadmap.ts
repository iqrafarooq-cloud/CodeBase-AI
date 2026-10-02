import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { SessionSupabase } from "@/lib/auth";
import type { AiSummary, AnalysisFacts, TechItem } from "@/lib/types";
import { chatModel, UNTRUSTED_CONTENT_POLICY } from "./provider";
import { isAiConfigured } from "@/lib/env";

export type Profile = {
  display_name: string | null;
  experience_level: "beginner" | "intermediate" | "advanced" | null;
  developer_role: string | null;
  learning_goal: string | null;
  learning_style: string | null;
  weekly_hours: number | null;
};

type TaskDraft = {
  title: string;
  description: string;
  whyItMatters: string;
  relevantFiles: string[];
  suggestedQuestions: string[];
  estimatedMinutes: number;
};

const roadmapSchema = z.object({
  title: z.string(),
  summary: z.string(),
  tasks: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        whyItMatters: z.string(),
        relevantFiles: z.array(z.string()).max(6).describe("Paths copied exactly from the provided file list."),
        suggestedQuestions: z.array(z.string()).max(3).describe("Questions the developer can ask the codebase assistant."),
        estimatedMinutes: z.number().int().min(5).max(480),
      }),
    )
    .min(5)
    .max(10),
});

type AnalysisInput = { summary: Partial<AiSummary>; facts: AnalysisFacts; technology_stack: TechItem[] };

function scale(minutes: number, level: Profile["experience_level"]) {
  const f = level === "beginner" ? 1.5 : level === "advanced" ? 0.7 : 1;
  return Math.max(5, Math.round((minutes * f) / 5) * 5);
}

/** Repository-grounded plan built purely from static analysis (used without an AI key or on AI failure). */
export function deterministicRoadmap(name: string, a: AnalysisInput, profile: Profile, paths: string[]) {
  const { facts } = a;
  const lvl = profile.experience_level;
  const readme = paths.find((p) => /^readme(\.\w+)?$/i.test(p));
  const manifests = facts.configFiles.filter((p) => /package\.json|requirements|pyproject|\.env\.example|docker/i.test(p));
  const tests = paths.filter((p) => /(\.(test|spec)\.|(^|\/)(tests?|__tests__|e2e)\/)/.test(p));
  const apiRoutes = facts.routes.filter((r) => r.kind === "api");
  const keyFiles = facts.importantFiles.filter((f) => f.reason.startsWith("Imported by")).map((f) => f.path);
  const tasks: TaskDraft[] = [
    {
      title: "Understand the project overview",
      description: `Read the README and the generated overview of ${name} to learn what it does and how it is organised.`,
      whyItMatters: "A mental model of the purpose and structure makes every later file easier to place.",
      relevantFiles: [readme, ...facts.importantFiles.slice(0, 2).map((f) => f.path)].filter(Boolean) as string[],
      suggestedQuestions: ["Explain this project to me.", "What are the main directories and what do they contain?"],
      estimatedMinutes: scale(20, lvl),
    },
    {
      title: "Set up the development environment",
      description: "Install dependencies, configure environment variables and run the project locally using the scripts in the manifests.",
      whyItMatters: "Running the code lets you verify your understanding and experiment safely.",
      relevantFiles: manifests.slice(0, 5),
      suggestedQuestions: ["Which scripts start the app and run the tests?", "Which environment variables are required?"],
      estimatedMinutes: scale(30, lvl),
    },
    {
      title: "Explore the entry points",
      description: "Follow how execution starts by reading the detected entry points in order.",
      whyItMatters: "Entry points show how the application boots and which modules are loaded first.",
      relevantFiles: facts.entryPoints.slice(0, 5).map((e) => e.path),
      suggestedQuestions: ["Explain the application's entry point.", "What happens when the app starts?"],
      estimatedMinutes: scale(30, lvl),
    },
    {
      title: "Study the most-used modules",
      description: "These files are imported by many others; understanding them unlocks large parts of the codebase.",
      whyItMatters: "Heavily shared modules usually encode the core domain logic and conventions.",
      relevantFiles: keyFiles.slice(0, 5),
      suggestedQuestions: keyFiles.slice(0, 2).map((p) => `What does ${p} do and who uses it?`),
      estimatedMinutes: scale(45, lvl),
    },
  ];
  if (apiRoutes.length) {
    tasks.push({
      title: "Trace a request through the API",
      description: `Pick an API route (e.g. ${apiRoutes[0].route}) and trace it from the caller to data access.`,
      whyItMatters: "Tracing one real request end to end teaches the layering and error-handling conventions.",
      relevantFiles: apiRoutes.slice(0, 4).map((r) => r.path),
      suggestedQuestions: [`Trace a request to ${apiRoutes[0].route} from the frontend to the backend.`],
      estimatedMinutes: scale(45, lvl),
    });
  }
  tasks.push({
    title: "Review testing and quality practices",
    description: tests.length ? "Read a few existing tests to learn how the team verifies behaviour." : "No test files were detected. Check the scripts and CI configuration for quality gates.",
    whyItMatters: "Knowing how changes are verified tells you how to contribute safely.",
    relevantFiles: (tests.length ? tests : facts.configFiles.filter((p) => /eslint|vitest|jest|playwright|workflows/.test(p))).slice(0, 4),
    suggestedQuestions: ["How is this project tested?", "How do I run the tests?"],
    estimatedMinutes: scale(25, lvl),
  });
  tasks.push({
    title: "Complete a small exploration task",
    description: profile.learning_goal
      ? `Apply what you learned toward your goal: "${profile.learning_goal.slice(0, 160)}". Find the code you would change first and explain it to the assistant.`
      : "Choose a small feature, locate every file it touches and write down how data flows between them.",
    whyItMatters: "Active exploration turns reading into working knowledge.",
    relevantFiles: [],
    suggestedQuestions: ["Which files should I read first?", "Where would I add a new feature like this?"],
    estimatedMinutes: scale(60, lvl),
  });
  return {
    title: `Onboarding plan for ${name}`,
    summary: "Generated from static analysis of the repository.",
    tasks: tasks.filter((t, i) => i < 2 || t.relevantFiles.length > 0 || i === tasks.length - 1),
  };
}

async function aiRoadmap(name: string, a: AnalysisInput, profile: Profile, paths: string[]) {
  const prompt = `Repository: ${name}
Technology: ${a.technology_stack.map((t) => t.name).join(", ")}
Purpose (AI summary): ${a.summary.purpose ?? "unknown"}
Entry points: ${a.facts.entryPoints.map((e) => e.path).join(", ") || "none"}
Important files: ${a.facts.importantFiles.map((f) => `${f.path} (${f.reason})`).join("; ")}
Routes: ${a.facts.routes.slice(0, 30).map((r) => `${r.kind} ${r.route} -> ${r.path}`).join("; ") || "none"}
Workflows: ${(a.summary.workflows ?? []).map((w) => w.name).join(", ") || "unknown"}

FILE LIST:
${paths.slice(0, 500).join("\n")}

Developer profile:
- Experience: ${profile.experience_level ?? "unknown"}
- Role: ${profile.developer_role ?? "unknown"}
- Goal: ${profile.learning_goal ?? "general onboarding"}
- Learning style: ${profile.learning_style ?? "not specified"}
- Weekly time available: ${profile.weekly_hours ? `${profile.weekly_hours}h` : "not specified"}

Create an ordered onboarding roadmap (5-9 tasks) for THIS repository: overview, environment setup, entry points, key modules, tracing an important workflow, testing practices, and a small hands-on exploration task. Tailor depth and durations to the developer's experience and role. Every relevantFiles entry must be copied exactly from the file list.`;
  const { output } = await generateText({
    model: chatModel(),
    system: `You design practical onboarding plans for software developers joining an existing codebase.\n${UNTRUSTED_CONTENT_POLICY}`,
    prompt,
    output: Output.object({ schema: roadmapSchema }),
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(90_000),
  });
  const valid = new Set(paths);
  return { ...output, tasks: output.tasks.map((t) => ({ ...t, relevantFiles: t.relevantFiles.filter((p) => valid.has(p)) })) };
}

/** Generates (or regenerates) the user's roadmap for a repository and stores it. */
export async function generateAndSaveRoadmap(supabase: SessionSupabase, userId: string, repo: { id: string; name: string }) {
  const [{ data: analysis }, { data: profile }, { data: files }] = await Promise.all([
    supabase.from("repository_analyses").select("summary, facts, technology_stack").eq("repository_id", repo.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("profiles").select("display_name, experience_level, developer_role, learning_goal, learning_style, weekly_hours").eq("id", userId).single(),
    supabase.from("repository_files").select("file_path").eq("repository_id", repo.id).limit(3000),
  ]);
  if (!analysis) throw new Error("Repository has not been analyzed yet.");
  const paths = (files ?? []).map((f) => f.file_path as string);
  const input = analysis as unknown as AnalysisInput;
  const p = (profile ?? {}) as Profile;

  let plan: { title: string; summary: string; tasks: TaskDraft[] };
  let generatedBy: "ai" | "deterministic" = "deterministic";
  if (isAiConfigured()) {
    try {
      plan = await aiRoadmap(repo.name, input, p, paths);
      generatedBy = "ai";
    } catch (e) {
      console.warn("AI roadmap failed, using deterministic plan:", e instanceof Error ? e.message : e);
      plan = deterministicRoadmap(repo.name, input, p, paths);
    }
  } else {
    plan = deterministicRoadmap(repo.name, input, p, paths);
  }

  const { data: roadmap, error } = await supabase
    .from("onboarding_roadmaps")
    .insert({
      user_id: userId,
      repository_id: repo.id,
      title: plan.title.slice(0, 200),
      summary: plan.summary,
      experience_level: p.experience_level,
      developer_role: p.developer_role,
      learning_goal: p.learning_goal,
      generated_by: generatedBy,
    })
    .select("id")
    .single();
  if (error || !roadmap) throw new Error("Could not save roadmap.");

  const { error: taskError } = await supabase.from("onboarding_tasks").insert(
    plan.tasks.map((t, i) => ({
      roadmap_id: roadmap.id,
      title: t.title.slice(0, 200),
      description: t.description,
      why_it_matters: t.whyItMatters,
      relevant_files: t.relevantFiles,
      suggested_questions: t.suggestedQuestions,
      estimated_minutes: Math.min(Math.max(Math.round(t.estimatedMinutes), 5), 480),
      sort_order: i,
    })),
  );
  if (taskError) {
    await supabase.from("onboarding_roadmaps").delete().eq("id", roadmap.id);
    throw new Error("Could not save roadmap tasks.");
  }
  // Keep a single active roadmap per repository.
  await supabase.from("onboarding_roadmaps").delete().eq("user_id", userId).eq("repository_id", repo.id).neq("id", roadmap.id);
  return { id: roadmap.id, title: plan.title, generatedBy, tasks: plan.tasks.map((t) => t.title) };
}
