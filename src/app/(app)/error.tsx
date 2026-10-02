"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorNotice } from "@/components/ui/primitives";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-2xl pt-10">
      <ErrorNotice
        title="This page could not be loaded"
        message="A temporary problem occurred. Your data is safe - try again in a moment."
        action={
          <Button size="sm" variant="outline" onClick={reset}>
            <RefreshCw /> Try again
          </Button>
        }
      />
    </div>
  );
}
