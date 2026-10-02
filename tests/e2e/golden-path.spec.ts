import { expect, test } from "@playwright/test";

/**
 * Full user journey against a real Supabase project and AI provider.
 * Requires: the app's normal .env.local plus E2E_REPO_URL (a small public repository).
 * New accounts are created per run; the Supabase project must have email confirmation
 * disabled (or use a project where sign-up returns a session).
 */
const repoUrl = process.env.E2E_REPO_URL;
test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL || !repoUrl, "Set Supabase env vars and E2E_REPO_URL to run the golden path.");

test("sign up → onboard → analyze → chat with citations → explorer → roadmap", async ({ page }) => {
  const email = `e2e+${Date.now()}@example.com`;

  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/Password/).fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Create account" }).click();

  // Onboarding wizard
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Display name").fill("E2E Dev");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("radio", { name: /Intermediate/ }).click();
  await page.getByRole("radio", { name: "Full Stack" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Main onboarding goal").fill("Understand how requests are handled");
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // Connect repository and wait for analysis
  await page.goto("/repositories/new");
  await page.getByLabel("Public repository URL").fill(repoUrl!);
  await page.getByRole("button", { name: "Import and analyze" }).click();
  await expect(page).toHaveURL(/\/repositories\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Technology stack")).toBeVisible({ timeout: 150_000 });

  // Ask a repository-specific question
  await page.getByRole("link", { name: "Chat" }).click();
  await page.getByRole("button", { name: "Explain the application's entry point." }).click();
  const answer = page.getByTestId("message-assistant").last();
  await expect(answer.getByTestId("sources")).toBeVisible({ timeout: 120_000 });

  // Open a cited file in the explorer
  await answer.getByTestId("sources").getByRole("button").first().click();
  await answer.getByTestId("open-in-explorer").first().click();
  await expect(page).toHaveURL(/\/explorer\?path=/);
  await expect(page.getByTestId("code-viewer")).not.toContainText("Loading");

  // Roadmap: generate and complete a task
  await page.getByRole("link", { name: "Roadmap" }).click();
  await page.getByRole("button", { name: "Generate my roadmap" }).click();
  const first = page.getByTestId("roadmap-task").first();
  await expect(first).toBeVisible({ timeout: 120_000 });
  await first.getByTestId("task-toggle").click();
  await expect(page.getByText(/1\/\d+ tasks/)).toBeVisible();
});
