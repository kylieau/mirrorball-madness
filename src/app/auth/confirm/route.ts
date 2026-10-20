import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRelativePath } from "@/lib/safe-relative-path";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  if (!tokenHash || (type !== "signup" && type !== "recovery")) return NextResponse.redirect(new URL("/login?error=confirmation", url.origin));
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  const next = safeRelativePath(url.searchParams.get("next") ?? undefined, type === "recovery" ? "/reset-password" : "/");
  return NextResponse.redirect(new URL(error ? "/login?error=confirmation" : next, url.origin));
}
