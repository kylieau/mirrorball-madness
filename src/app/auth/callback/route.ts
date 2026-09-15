import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDefaultLandingPath } from "@/lib/default-landing";
import { safeRelativePath } from "@/lib/safe-relative-path";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // This is a public GET route, so `next` is untrusted input even though
  // the current only caller (signInWithGoogle) already validates it before
  // ever appending it — never trust a redirect target read straight off
  // the request, validate again at the point of use.
  const next = safeRelativePath(searchParams.get("next") ?? undefined, getDefaultLandingPath());

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("Could not authenticate")}`
  );
}
