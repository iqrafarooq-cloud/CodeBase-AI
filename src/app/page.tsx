import Link from "next/link";
import { ArrowRight, BookOpenCheck, FileSearch, GitBranch, MessagesSquare, Network, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";

const features = [
  { icon: GitBranch, title: "Connect any repository", text: "Import a public GitHub repository or upload a ZIP. Files are filtered, secrets are redacted, nothing is executed." },
  { icon: FileSearch, title: "Static analysis first", text: "Languages, symbols, entry points, routes and an import graph are extracted deterministically." },
  { icon: MessagesSquare, title: "An agent that cites its sources", text: "A tool-using agent searches the code and answers with file and line references you can open." },
  { icon: Network, title: "Architecture explorer", text: "An interactive map of layers, modules and external services built from real import relationships." },
  { icon: BookOpenCheck, title: "Personal onboarding roadmap", text: "An ordered plan tailored to your experience and goals, grounded in the files that matter." },
  { icon: ShieldCheck, title: "Secure by design", text: "Row-level security, server-side ownership checks and untrusted-content guards on every request." },
];

export default function LandingPage() {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--primary)_22%,transparent),transparent_65%)]" />
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/signup">Get started</Link>
          </Button>
        </nav>
      </header>

      <main className="relative mx-auto max-w-6xl px-6">
        <section className="pb-16 pt-16 text-center sm:pt-24">
          <p className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-success" /> Agentic developer onboarding
          </p>
          <h1 className="mx-auto max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            Understand any codebase on your <span className="bg-gradient-to-r from-primary via-violet to-cyan bg-clip-text text-transparent">first day</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-balance text-base text-muted-foreground sm:text-lg">
            CodeBase AI analyzes a repository, maps its architecture and gives new developers an assistant that answers from the actual source - with citations.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <Link href="/signup">
                Analyze a repository <ArrowRight />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/login">I have an account</Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-card/70 p-5">
              <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <f.icon className="size-4" />
              </div>
              <h2 className="text-sm font-semibold">{f.title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
