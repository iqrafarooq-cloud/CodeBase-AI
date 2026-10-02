"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string } | undefined;

const credentials = z.object({
  email: z.email("Enter a valid email address").max(254),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

/** Only allow same-origin relative redirects. */
function safeNext(value: FormDataEntryValue | null) {
  const v = typeof value === "string" ? value : "";
  return v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/dashboard";
}

async function origin() {
  const h = await headers();
  return process.env.NEXT_PUBLIC_APP_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

function friendly(message: string) {
  if (/invalid login credentials/i.test(message)) return "Incorrect email or password.";
  if (/email not confirmed/i.test(message)) return "Please confirm your email address first - check your inbox.";
  if (/already registered/i.test(message)) return "An account with this email already exists.";
  if (/rate limit/i.test(message)) return "Too many attempts. Please wait a moment and try again.";
  return "Authentication failed. Please try again.";
}

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: friendly(error.message) };
  redirect(safeNext(form.get("next")));
}

export async function signUp(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${await origin()}/auth/callback?next=/onboarding` },
  });
  if (error) return { error: friendly(error.message) };
  if (!data.session) return { message: "Check your email to confirm your account, then sign in." };
  redirect("/onboarding");
}

export async function requestPasswordReset(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = z.email().safeParse(form.get("email"));
  if (!email.success) return { error: "Enter a valid email address." };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: `${await origin()}/auth/callback?next=/auth/reset-password` });
  // Same response whether or not the account exists (prevents account enumeration).
  return { message: "If an account exists for that email, a reset link is on its way." };
}

export async function updatePassword(_prev: AuthState, form: FormData): Promise<AuthState> {
  const password = z.string().min(8, "Password must be at least 8 characters").max(128).safeParse(form.get("password"));
  if (!password.success) return { error: password.error.issues[0].message };
  if (form.get("password") !== form.get("confirm")) return { error: "Passwords do not match." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) return { error: "Could not update the password. The reset link may have expired." };
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
