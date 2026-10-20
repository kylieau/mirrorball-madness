"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { App, type URLOpenListenerEvent } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { createClient } from "@/lib/supabase/client";
import { NATIVE_AUTH_SCHEME } from "@/lib/native-auth";
import { getDefaultLandingPath } from "@/lib/default-landing";
import { safeRelativePath } from "@/lib/safe-relative-path";

// Catches the deep link Google/Supabase redirect to once native OAuth
// (started in GoogleSignInButton) finishes in the system browser, then
// exchanges the code client-side so the WebView's own cookies pick up
// the session — mirroring what src/app/auth/callback/route.ts does for
// the web flow, which a custom-scheme URL can't reach directly.
export function NativeAuthListener() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handle = App.addListener("appUrlOpen", async (event: URLOpenListenerEvent) => {
      if (!event.url.startsWith(`${NATIVE_AUTH_SCHEME}://`)) return;

      const url = new URL(event.url);
      if (url.hostname !== "auth" || url.pathname !== "/callback") return;
      let next = getDefaultLandingPath();
      try { next = safeRelativePath(sessionStorage.getItem("mirrorball-native-auth-next") ?? undefined, next); }
      catch { /* Storage may be unavailable; use the normal landing page. */ }
      const failure = `/login?error=oauth&next=${encodeURIComponent(next)}`;
      try {
        try { await Browser.close(); } catch { /* The system browser may already be closed. */ }
        const code = url.searchParams.get("code");
        if (!code) { window.location.assign(failure); return; }
        const supabase = createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) { try { sessionStorage.removeItem("mirrorball-native-auth-next"); } catch { /* Optional UI storage. */ } }
        window.location.assign(error ? failure : next);
      } catch { window.location.assign(failure); }
    });

    return () => {
      handle.then((listener) => listener.remove());
    };
  }, []);

  return null;
}
