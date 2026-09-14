import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDefaultLandingPath } from "@/lib/default-landing";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const explicitNext = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const next = explicitNext ?? getDefaultLandingPath();
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("Could not authenticate")}`
  );
}
