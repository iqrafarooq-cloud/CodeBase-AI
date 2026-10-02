import Link from "next/link";
import { Network } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="flex size-7 items-center justify-center rounded-md bg-gradient-to-br from-primary to-violet text-primary-foreground shadow-sm">
        <Network className="size-4" />
      </span>
      <span>
        CodeBase <span className="text-primary">AI</span>
      </span>
    </Link>
  );
}
