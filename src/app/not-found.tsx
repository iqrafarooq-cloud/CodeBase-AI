import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-xl border border-border bg-muted">
        <FileQuestion className="size-5 text-muted-foreground" />
      </div>
      <h1 className="text-lg font-semibold">Not found</h1>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">This page or repository does not exist, or you do not have access to it.</p>
      <Button className="mt-6" asChild>
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
