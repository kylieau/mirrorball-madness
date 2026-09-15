"use client";

import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { signInWithGoogle } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { NATIVE_AUTH_CALLBACK_URL } from "@/lib/native-auth";

async function signInWithGoogleNative() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: NATIVE_AUTH_CALLBACK_URL,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) return;

  // Google blocks OAuth sign-in inside embedded WebViews, so this opens
  // an SFSafariViewController (a trusted context) instead of navigating
  // the app's own WebView. The Google account picker/consent screen
  // finishes there, then redirects to NATIVE_AUTH_CALLBACK_URL, which
  // NativeAuthListener (in the root layout) catches to resume the app.
  await Browser.open({ url: data.url });
}

export function GoogleSignInButton({ next }: { next?: string }) {
  if (Capacitor.isNativePlatform()) {
    return (
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => signInWithGoogleNative()}
      >
        Continue with Google
      </Button>
    );
  }

  return (
    <form action={signInWithGoogle}>
      {next && <input type="hidden" name="next" value={next} />}
      <Button type="submit" variant="outline" className="w-full">
        Continue with Google
      </Button>
    </form>
  );
}
