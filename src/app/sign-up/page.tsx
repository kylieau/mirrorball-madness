import { AuthForm } from "@/components/auth-form";
import { authErrorMessage } from "@/lib/auth-form-state";
import Link from "next/link";
import { GoogleSignInButton } from "@/components/google-sign-in-button";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-24">
      <h1 className="text-2xl font-semibold tracking-tight">Create an Account</h1>
      {error && <p role="alert" className="text-sm text-danger-text">{authErrorMessage(error)}</p>}
      <AuthForm mode="sign-up" next={next} />
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        or
        <div className="h-px flex-1 bg-border" />
      </div>
      <GoogleSignInButton next={next} />
      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href={loginHref} className="underline underline-offset-4">
          Sign In
        </Link>
      </p>
    </div>
  );
}
