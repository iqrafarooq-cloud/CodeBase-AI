import Link from "next/link";
import { signUp } from "../actions";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <>
      <h1 className="text-lg font-semibold">Create your account</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">Start onboarding onto any codebase in minutes.</p>
      <AuthForm
        action={signUp}
        submitLabel="Create account"
        fields={[
          { name: "email", label: "Email", type: "email", autoComplete: "email" },
          { name: "password", label: "Password", type: "password", autoComplete: "new-password" },
        ]}
        footer={
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-foreground hover:underline">
              Sign in
            </Link>
          </>
        }
      />
    </>
  );
}
