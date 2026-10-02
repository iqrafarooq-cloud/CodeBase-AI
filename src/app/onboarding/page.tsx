import { redirect } from "next/navigation";
import { Logo } from "@/components/app/logo";
import { ProfileForm } from "@/components/app/profile-form";
import { getShellData } from "@/lib/data";

export const metadata = { title: "Welcome" };

export default async function OnboardingPage() {
  const { profile } = await getShellData();
  if (profile?.onboarded_at) redirect("/dashboard");
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--primary)_18%,transparent),transparent_70%)]" />
      <Logo className="relative mb-8" href="/onboarding" />
      <div className="relative w-full max-w-xl rounded-xl border border-border bg-card p-6 shadow-xl shadow-black/10 sm:p-8">
        <p className="mb-1 text-xs font-medium uppercase tracking-wider text-primary">Personalize your onboarding</p>
        <p className="mb-6 text-sm text-muted-foreground">Your answers tailor explanations and your roadmap. You can change them later in Settings.</p>
        <ProfileForm
          mode="wizard"
          initial={{
            display_name: profile?.display_name ?? "",
            experience_level: profile?.experience_level,
            developer_role: profile?.developer_role,
          }}
        />
      </div>
    </div>
  );
}
