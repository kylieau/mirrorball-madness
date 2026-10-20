import Link from "next/link";
import { getAuthUser } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

// Logged-out chrome: login, sign-up, and the guest Home, Results, Picks and
// Standings, where it stays pinned like the signed-in fan tabs' top bar.
// Authenticated routes each render their own header.
export async function SiteHeader() {
  const user = await getAuthUser();

  if (user) return null;

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex min-h-14 max-w-5xl items-center justify-between px-4 py-2">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          Mirrorball Madness
        </Link>
        <div className="flex items-center gap-2">
          <Button render={<Link href="/login" />} nativeButton={false} variant="ghost" size="sm">
            Sign In
          </Button>
          <Button render={<Link href="/sign-up" />} nativeButton={false} size="sm">
            Sign Up
          </Button>
        </div>
      </div>
    </header>
  );
}
