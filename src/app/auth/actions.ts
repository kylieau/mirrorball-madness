"use server";

import { authErrorMessage, type AuthFormState } from "@/lib/auth-form-state";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDefaultLandingPath } from "@/lib/default-landing";
import { safeRelativePath } from "@/lib/safe-relative-path";

function resolveNextPath(formData: FormData): string {
  const next = formData.get("next");
  return safeRelativePath(typeof next === "string" ? next : undefined, getDefaultLandingPath());
}

export async function signIn(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  }).catch(() => ({ error: { message: "Network request failed" } }));

  if (error) {
    return { error: authErrorMessage(error.message) };
  }

  revalidatePath("/", "layout");
  redirect(resolveNextPath(formData));
}

export async function signUp(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const supabase = await createClient();
  const origin = (await headers()).get("origin");
  const displayName = (formData.get("displayName") as string).trim();
  if (!displayName) return { error: "Display name is required." };

  const { data, error } = await supabase.auth.signUp({
    email: formData.get("email") as string,
    password: formData.get("password") as string,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(resolveNextPath(formData))}`,
    },
  }).catch(() => ({ data: { session: null }, error: { message: "Network request failed" } }));

  if (error) {
    return { error: authErrorMessage(error.message) };
  }

  if (!data.session) return { error: null, notice: "Check your email to confirm your account, then continue to your invitation." };

  revalidatePath("/", "layout");
  redirect(resolveNextPath(formData));
}

export async function signInWithGoogle(formData: FormData) {
  const supabase = await createClient();
  const origin = (await headers()).get("origin");

  const next = formData.get("next");
  const validatedNext = safeRelativePath(typeof next === "string" ? next : undefined, "");
  const callbackUrl = `${origin}/auth/callback${validatedNext ? `?next=${encodeURIComponent(validatedNext)}` : ""}`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl,
    },
  });

  if (error || !data.url) {
    redirect(`/login?error=oauth&next=${encodeURIComponent(resolveNextPath(formData))}`);
  }

  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
