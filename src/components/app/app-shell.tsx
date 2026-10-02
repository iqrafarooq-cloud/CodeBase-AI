"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpenCheck,
  ChevronsUpDown,
  FolderGit2,
  FolderTree,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  Moon,
  Network,
  Plus,
  Settings,
  Sun,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";
import { AnimatePresence, motion } from "framer-motion";
import { signOut } from "@/app/(auth)/actions";
import { Logo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dialog";
import { StatusDot } from "@/components/app/status";
import { cn } from "@/lib/utils";
import type { AnalysisStatus } from "@/lib/types";

type ShellRepo = { id: string; name: string; status: AnalysisStatus };

const COOKIE = "cbai_active_repo";

function setActiveRepoCookie(id: string) {
  document.cookie = `${COOKIE}=${id}; path=/; max-age=${60 * 60 * 24 * 180}; samesite=lax`;
}

export function AppShell({
  children,
  user,
  repositories,
  activeRepoId,
}: {
  children: React.ReactNode;
  user: { email: string; name: string };
  repositories: ShellRepo[];
  activeRepoId: string | null;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const routeRepoId = /^\/repositories\/([0-9a-f-]{36})/.exec(pathname)?.[1] ?? null;
  const currentRepo = repositories.find((r) => r.id === (routeRepoId ?? activeRepoId)) ?? null;

  useEffect(() => {
    if (routeRepoId) setActiveRepoCookie(routeRepoId);
  }, [routeRepoId]);

  // Close the mobile drawer on navigation (state adjusted during render, not in an effect).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMobileOpen(false);
  }

  const repoHref = (section: string, global: string) => (currentRepo ? `/repositories/${currentRepo.id}/${section}` : global);
  const nav = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard, match: (p: string) => p === "/dashboard" },
    { href: "/repositories", label: "My Repositories", icon: FolderGit2, match: (p: string) => p === "/repositories" || p === "/repositories/new" || /^\/repositories\/[^/]+$/.test(p) },
    { href: repoHref("chat", "/chat"), label: "AI Codebase Chat", icon: MessagesSquare, match: (p: string) => p.endsWith("/chat") },
    { href: repoHref("architecture", "/architecture"), label: "Architecture Explorer", icon: Network, match: (p: string) => p.endsWith("/architecture") },
    { href: repoHref("roadmap", "/roadmap"), label: "Onboarding Roadmap", icon: BookOpenCheck, match: (p: string) => p.endsWith("/roadmap") },
    { href: repoHref("explorer", "/explorer"), label: "Code Explorer", icon: FolderTree, match: (p: string) => p.endsWith("/explorer") },
    { href: "/settings", label: "Settings", icon: Settings, match: (p: string) => p.startsWith("/settings") },
  ];

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center px-4">
        <Logo href="/dashboard" className="text-sm" />
      </div>
      <nav className="flex-1 space-y-0.5 px-2 py-2" aria-label="Main">
        {nav.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                active ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" />}
              <item.icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <UserMenu user={user} />
    </div>
  );

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-border bg-sidebar lg:block">{sidebar}</aside>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-64 border-r border-border bg-sidebar lg:hidden"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "tween", duration: 0.2 }}
            >
              <button className="absolute right-3 top-4 rounded-md p-1 text-muted-foreground hover:bg-muted" onClick={() => setMobileOpen(false)} aria-label="Close navigation">
                <X className="size-4" />
              </button>
              {sidebar}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur lg:px-6">
          <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu />
          </Button>
          <RepoSelector repositories={repositories} current={currentRepo} />
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function RepoSelector({ repositories, current }: { repositories: ShellRepo[]; current: ShellRepo | null }) {
  const router = useRouter();
  const pathname = usePathname();
  if (repositories.length === 0) {
    return (
      <Button variant="outline" size="sm" asChild>
        <Link href="/repositories/new">
          <Plus /> Connect repository
        </Link>
      </Button>
    );
  }
  const section = /^\/repositories\/[^/]+\/(chat|architecture|roadmap|explorer)/.exec(pathname)?.[1];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="max-w-[60vw] justify-between gap-2 sm:max-w-xs" data-testid="repo-selector">
          {current ? <StatusDot status={current.status} /> : <FolderGit2 />}
          <span className="truncate">{current?.name ?? "Select a repository"}</span>
          <ChevronsUpDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Repositories</DropdownMenuLabel>
        {repositories.map((r) => (
          <DropdownMenuItem
            key={r.id}
            onSelect={() => {
              setActiveRepoCookie(r.id);
              router.push(`/repositories/${r.id}${section ? `/${section}` : ""}`);
            }}
          >
            <StatusDot status={r.status} />
            <span className="truncate">{r.name}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/repositories/new")}>
          <Plus /> Connect repository
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- avoid hydration mismatch for theme icon
  useEffect(() => setMounted(true), []);
  const dark = resolvedTheme !== "light";
  return (
    <Button variant="ghost" size="icon-sm" onClick={() => setTheme(dark ? "light" : "dark")} aria-label="Toggle theme">
      {mounted ? dark ? <Sun /> : <Moon /> : <Moon className="opacity-0" />}
    </Button>
  );
}

function UserMenu({ user }: { user: { email: string; name: string } }) {
  const initials = user.name.slice(0, 2).toUpperCase();
  return (
    <div className="border-t border-border p-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-muted">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-violet/80 text-[11px] font-semibold text-white">{initials}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{user.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-56">
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <Settings /> Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void signOut()}>
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
