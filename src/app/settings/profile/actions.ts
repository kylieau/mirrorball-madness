"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateProfile(displayName: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not signed in" };
  }

  const trimmed = displayName.trim();
  if (!trimmed) {
    return { error: "Display name is required" };
  }

  // Allowed by the existing column-level grant on profiles (display_name,
  // avatar_url only) — no RPC needed, RLS already scopes this to self.
  const { error } = await supabase.from("profiles").update({ display_name: trimmed }).eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { error: null };
}
