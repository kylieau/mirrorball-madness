"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { App, type URLOpenListenerEvent } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { createClient } from "@/lib/supabase/client";
import { NATIVE_AUTH_SCHEME } from "@/lib/native-auth";
import { getDefaultLandingPath } from "@/lib/default-landing";

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

      await Browser.close();

      const url = new URL(event.url);
      const code = url.searchParams.get("code");
      if (!code) {
        window.location.assign(
          `/login?error=${encodeURIComponent("Could not authenticate")}`
        );
        return;
      }

      const supabase = createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      window.location.assign(
        error ? `/login?error=${encodeURIComponent(error.message)}` : getDefaultLandingPath()
      );
    });

    return () => {
      handle.then((listener) => listener.remove());
    };
  }, []);

  return null;
}
