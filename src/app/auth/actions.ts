"use server";

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

export async function signIn(formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect(resolveNextPath(formData));
}

export async function signUp(formData: FormData) {
  const supabase = await createClient();
  const origin = (await headers()).get("origin");

  const { error } = await supabase.auth.signUp({
    email: formData.get("email") as string,
    password: formData.get("password") as string,
    options: {
      data: { display_name: formData.get("displayName") as string },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    redirect(`/sign-up?error=${encodeURIComponent(error.message)}`);
  }

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
    redirect(`/login?error=${encodeURIComponent(error?.message ?? "Could not start Google sign-in")}`);
  }

  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
