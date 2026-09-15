import Link from "next/link";
import { signIn } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <form action={signIn} className="flex flex-col gap-4">
        {next && <input type="hidden" name="next" value={next} />}
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" required />
        </div>
        <Button type="submit">Sign in</Button>
      </form>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        or
        <div className="h-px flex-1 bg-border" />
      </div>
      <GoogleSignInButton next={next} />
      <p className="text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href={signUpHref} className="underline underline-offset-4">
          Sign up
        </Link>
      </p>
    </div>
  );
}
