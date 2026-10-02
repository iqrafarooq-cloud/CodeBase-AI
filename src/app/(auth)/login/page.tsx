import Link from "next/link";
import { signIn } from "../actions";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <>
      <h1 className="text-lg font-semibold">Welcome back</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">Sign in to continue exploring your repositories.</p>
      {error && <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">That link is invalid or has expired.</p>}
      <AuthForm
        action={signIn}
        next={next}
        forgotLink
        submitLabel="Sign in"
        fields={[
          { name: "email", label: "Email", type: "email", autoComplete: "email" },
          { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
        ]}
        footer={
          <>
            New to CodeBase AI?{" "}
            <Link href="/signup" className="font-medium text-foreground hover:underline">
              Create an account
            </Link>
          </>
        }
      />
    </>
  );
}
