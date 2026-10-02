import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AppShell } from "@/components/app/app-shell";
import { ACTIVE_REPO_COOKIE, getShellData } from "@/lib/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, repositories } = await getShellData();
  if (!profile?.onboarded_at) redirect("/onboarding");
  const activeRepoId = (await cookies()).get(ACTIVE_REPO_COOKIE)?.value ?? null;
  return (
    <AppShell
      user={{ email: user.email ?? "", name: profile.display_name ?? user.email ?? "Developer" }}
      repositories={repositories.map((r) => ({ id: r.id, name: r.owner ? `${r.owner}/${r.name}` : r.name, status: r.analysis_status }))}
      activeRepoId={activeRepoId}
    >
      {children}
    </AppShell>
  );
}
