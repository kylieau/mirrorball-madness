import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // The phone-still harness mounts real components with fixtures and has no
  // session. Skip the Supabase refresh so it can run without credentials.
  if (process.env.NODE_ENV === "development" && request.nextUrl.pathname.startsWith("/dev/")) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-preview-harness", "1");
    return NextResponse.next({ request: { headers: requestHeaders } });
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
