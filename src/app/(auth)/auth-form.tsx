"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";
import type { AuthState } from "./actions";

type Field = { name: string; label: string; type: string; autoComplete: string };

export function AuthForm({
  action,
  fields,
  submitLabel,
  next,
  footer,
  forgotLink,
}: {
  action: (prev: AuthState, form: FormData) => Promise<AuthState>;
  fields: Field[];
  submitLabel: string;
  next?: string;
  footer?: React.ReactNode;
  forgotLink?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      {fields.map((f) => (
        <div key={f.name} className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor={f.name}>{f.label}</Label>
            {forgotLink && f.type === "password" && (
              <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground">
                Forgot password?
              </Link>
            )}
          </div>
          <Input id={f.name} name={f.name} type={f.type} autoComplete={f.autoComplete} required />
        </div>
      ))}
      {state?.error && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state?.message && (
        <p role="status" className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          {state.message}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        {submitLabel}
      </Button>
      {footer && <p className="text-center text-sm text-muted-foreground">{footer}</p>}
    </form>
  );
}
