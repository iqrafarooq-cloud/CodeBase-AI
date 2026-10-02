"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenCheck, FolderTree, LayoutGrid, MessagesSquare, Network } from "lucide-react";
import { cn } from "@/lib/utils";

export function RepoTabs({ id }: { id: string }) {
  const pathname = usePathname();
  const base = `/repositories/${id}`;
  const tabs = [
    { href: base, label: "Overview", icon: LayoutGrid },
    { href: `${base}/chat`, label: "Chat", icon: MessagesSquare },
    { href: `${base}/architecture`, label: "Architecture", icon: Network },
    { href: `${base}/roadmap`, label: "Roadmap", icon: BookOpenCheck },
    { href: `${base}/explorer`, label: "Code", icon: FolderTree },
  ];
  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 lg:mx-0 lg:px-0" aria-label="Repository">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
              active ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="size-4" /> {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
