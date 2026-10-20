import { AuthForm } from "@/components/auth-form";
import { authErrorMessage } from "@/lib/auth-form-state";
import Link from "next/link";
import { GoogleSignInButton } from "@/components/google-sign-in-button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const signUpHref = next ? `/sign-up?next=${encodeURIComponent(next)}` : "/sign-up";

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-24">
      <h1 className="text-2xl font-semibold tracking-tight">Sign In</h1>
      {error && <p role="alert" className="text-sm text-danger-text">{authErrorMessage(error)}</p>}
      <AuthForm mode="sign-in" next={next} />
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        or
        <div className="h-px flex-1 bg-border" />
      </div>
      {process.env.AUTH_EMAIL_ENABLED === "true" && <Link href="/forgot-password" className="text-sm underline underline-offset-4">Forgot Password?</Link>}
      <GoogleSignInButton next={next} />
      <p className="text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href={signUpHref} className="underline underline-offset-4">
          Sign Up
        </Link>
      </p>
    </div>
  );
}
