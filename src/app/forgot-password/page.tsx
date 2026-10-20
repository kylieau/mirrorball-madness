import Link from "next/link";
import { PasswordRecoveryForm } from "@/components/password-recovery-form";

export default function ForgotPasswordPage() {
  return <main className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-24">
    <h1 className="text-2xl font-semibold">Recover Your Account</h1>
    {process.env.AUTH_EMAIL_ENABLED === "true" ? <PasswordRecoveryForm /> :
      <p className="text-sm text-muted-foreground">Email recovery is not available right now. Your league commissioner can help you contact the site owner.</p>}
    <Link href="/login" className="text-sm underline underline-offset-4">Back to Sign In</Link>
  </main>;
}
