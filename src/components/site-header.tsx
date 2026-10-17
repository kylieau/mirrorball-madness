import Link from "next/link";
import { getAuthUser } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

// Logged-out chrome only (login, sign-up). Authenticated
// routes each render their own header (in-league topbar, or a back-nav
// elsewhere) — see design/mockups.html, which has no persistent global chrome.
export async function SiteHeader() {
  const user = await getAuthUser();

  if (user) return null;

  return (
    <header className="border-b border-border pt-[env(safe-area-inset-top)]">
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
