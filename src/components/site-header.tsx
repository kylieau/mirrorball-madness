import Link from "next/link";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

// Logged-out chrome only (marketing page, login, sign-up). Authenticated
// routes each render their own header (in-league topbar, or a back-nav
// elsewhere) — see design/mockups.html, which has no persistent global chrome.
export async function SiteHeader() {
  // Dev-only preview route. Skip the auth lookup so the harness can render
  // without Supabase credentials; production never sets this header.
  if (
    process.env.NODE_ENV === "development" &&
    (await headers()).get("x-preview-harness") === "1"
  ) {
    return null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) return null;

  return (
    <header className="border-b border-border pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex min-h-14 max-w-5xl items-center justify-between px-4 py-2">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          Mirrorball Madness
        </Link>
        <div className="flex items-center gap-2">
          <Button render={<Link href="/login" />} nativeButton={false} variant="ghost" size="sm">
            Sign in
          </Button>
          <Button render={<Link href="/sign-up" />} nativeButton={false} size="sm">
            Sign Up
          </Button>
        </div>
      </div>
    </header>
  );
}
