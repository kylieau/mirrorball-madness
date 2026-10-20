import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PasswordRecoveryForm } from "@/components/password-recovery-form";

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/forgot-password");
  return <main className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-24">
    <h1 className="text-2xl font-semibold">Choose a New Password</h1>
    <PasswordRecoveryForm reset />
    <Link href="/" className="text-sm underline underline-offset-4">Return to Your Leagues</Link>
  </main>;
}
