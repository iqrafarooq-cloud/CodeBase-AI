import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { updatePassword } from "../../actions";
import { AuthForm } from "../../auth-form";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  const { user } = await getSessionUser();
  if (!user) redirect("/login?error=expired");
  return (
    <>
      <h1 className="text-lg font-semibold">Choose a new password</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">Signed in as {user.email}.</p>
      <AuthForm
        action={updatePassword}
        submitLabel="Update password"
        fields={[
          { name: "password", label: "New password", type: "password", autoComplete: "new-password" },
          { name: "confirm", label: "Confirm password", type: "password", autoComplete: "new-password" },
        ]}
      />
    </>
  );
}
