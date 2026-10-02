import { Logo } from "@/components/app/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--primary)_18%,transparent),transparent_70%)]" />
      <Logo className="relative mb-8" />
      <div className="relative w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xl shadow-black/10">{children}</div>
    </div>
  );
}
