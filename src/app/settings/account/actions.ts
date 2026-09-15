"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateEmail(email: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const trimmed = email.trim();
  if (!trimmed) {
    return { error: "Email is required" };
  }

  const { error } = await supabase.auth.updateUser({ email: trimmed });
  if (error) return { error: error.message };

  return { error: null };
}

export async function updatePassword(
  password: string,
  confirmPassword: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  if (!password || password.length < 6) {
    return { error: "Password must be at least 6 characters" };
  }
  if (password !== confirmPassword) {
    return { error: "Passwords don't match" };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  return { error: null };
}

export async function requestAccountDeletion(): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_account_deletion");
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { error: null };
}

export async function cancelAccountDeletion(): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_account_deletion");
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { error: null };
}
