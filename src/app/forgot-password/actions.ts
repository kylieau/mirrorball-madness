"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { AuthFormState } from "@/lib/auth-form-state";

export async function requestPasswordReset(_previous: AuthFormState, form: FormData): Promise<AuthFormState> {
  if (process.env.AUTH_EMAIL_ENABLED !== "true") return { error: "Email recovery is not available right now." };
  const origin = (await headers()).get("origin");
  if (!origin) return { error: "Could not start password recovery. Please try again." };
  const supabase = await createClient();
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(String(form.get("email") ?? ""), {
      redirectTo: `${origin}/auth/confirm?next=${encodeURIComponent("/reset-password")}`,
    });
    if (error) return { error: "Could not send a recovery email. Please wait and try again." };
    return { error: null, notice: "If an account exists for that email, a recovery link is on its way." };
  } catch {
    return { error: "Could not send a recovery email. Please try again." };
  }
}

export async function resetPassword(_previous: AuthFormState, form: FormData): Promise<AuthFormState> {
  const password = String(form.get("password") ?? "");
  if (password.length < 8 || password !== form.get("confirmPassword")) return { error: "Use matching passwords with at least 8 characters." };
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Your recovery session has expired. Request a new link." };
  try {
    const { error } = await supabase.auth.updateUser({ password });
    return error ? { error: "Could not update your password. Please try again." } : { error: null, notice: "Your password has been updated. You can return to your leagues." };
  } catch {
    return { error: "Could not update your password. Please try again." };
  }
}
