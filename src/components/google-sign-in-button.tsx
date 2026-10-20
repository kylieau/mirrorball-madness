"use client";

import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { signInWithGoogle } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/client";
import { SubmitButton } from "@/components/submit-button";
import { NATIVE_AUTH_CALLBACK_URL } from "@/lib/native-auth";
import { safeRelativePath } from "@/lib/safe-relative-path";

export function GoogleSignInButton({ next }: { next?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function nativeSignIn() {
    setPending(true); setError(null);
    try {
      try { sessionStorage.setItem("mirrorball-native-auth-next", safeRelativePath(next, "/")); }
      catch { /* Sign-in still works without optional invitation-return storage. */ }
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: {
        redirectTo: NATIVE_AUTH_CALLBACK_URL, skipBrowserRedirect: true,
      } });
      if (error || !data.url) throw new Error("OAuth unavailable");
      await Browser.open({ url: data.url });
    } catch {
      setError("Could not start Google sign-in. Please try again.");
    } finally { setPending(false); }
  }
  // Keep SSR and hydration markup identical; select the native flow only when submitted.
  return <form action={signInWithGoogle} onSubmit={(event) => {
    if (!Capacitor.isNativePlatform()) return;
    event.preventDefault(); void nativeSignIn();
  }}>
    {next && <input type="hidden" name="next" value={next} />}
    {error && <p role="alert" className="mb-2 text-sm text-danger-text">{error}</p>}
    <SubmitButton idleLabel="Continue with Google" pendingLabel="Connecting…" variant="outline" className="w-full" disabled={pending} />
  </form>;
}
