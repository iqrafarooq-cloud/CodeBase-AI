import { CheckCircle2, CircleDashed } from "lucide-react";
import { ProfileForm } from "@/components/app/profile-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader } from "@/components/ui/primitives";
import { getShellData } from "@/lib/data";
import { isAiConfigured, isEmbeddingConfigured, resolveAiProvider } from "@/lib/env";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { profile, user } = await getShellData();
  const integrations = [
    { name: `Chat model (${resolveAiProvider() === "groq" ? "Groq" : "Anthropic"})`, ok: isAiConfigured(), hint: "ANTHROPIC_API_KEY or GROQ_API_KEY (AI_PROVIDER selects one explicitly)" },
    { name: "Embeddings (semantic search)", ok: isEmbeddingConfigured(), hint: "EMBEDDING_API_KEY - keyword search is used without it" },
    { name: "GitHub token (higher rate limits)", ok: Boolean(process.env.GITHUB_TOKEN), hint: "GITHUB_TOKEN - optional" },
  ];
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" description={`Signed in as ${user.email}`} />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Developer profile</CardTitle>
            <CardDescription>Used to tailor explanations and your onboarding roadmap.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm
              mode="settings"
              initial={{
                display_name: profile?.display_name ?? "",
                experience_level: profile?.experience_level,
                developer_role: profile?.developer_role,
                learning_style: profile?.learning_style ?? "",
                learning_goal: profile?.learning_goal ?? "",
                weekly_hours: profile?.weekly_hours ? String(profile.weekly_hours) : "",
              }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Server integrations</CardTitle>
            <CardDescription>Configured by the deployment&apos;s environment variables. Keys are never sent to the browser.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {integrations.map((i) => (
                <li key={i.name} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                  <div>
                    <p className="font-medium">{i.name}</p>
                    <p className="text-xs text-muted-foreground">{i.hint}</p>
                  </div>
                  {i.ok ? (
                    <span className="flex items-center gap-1.5 text-success"><CheckCircle2 className="size-4" /> Configured</span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-muted-foreground"><CircleDashed className="size-4" /> Not configured</span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
