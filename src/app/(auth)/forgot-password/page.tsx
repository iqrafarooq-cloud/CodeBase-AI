import Link from "next/link";
import { requestPasswordReset } from "../actions";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-lg font-semibold">Reset your password</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">We will email you a secure link to choose a new password.</p>
      <AuthForm
        action={requestPasswordReset}
        submitLabel="Send reset link"
        fields={[{ name: "email", label: "Email", type: "email", autoComplete: "email" }]}
        footer={
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Back to sign in
          </Link>
        }
      />
    </>
  );
}
