"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clearAccountDeletionRequest } from "@/lib/account-deletions";

// Stricter than results entry: neither the view nor the propose tier may
// reach this queue (emails + user ids) — is_super_admin only.
async function requireSuperAdmin(): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_super_admin) return { error: "Not authorized" };
  return { error: null };
}

export async function clearPendingAccountDeletion(
  userId: string
): Promise<{ error: string | null }> {
  const access = await requireSuperAdmin();
  if (access.error) return access;

  const result = await clearAccountDeletionRequest(createAdminClient(), userId);
  if (!result.error) {
    revalidatePath("/admin/accounts");
    revalidatePath("/", "layout");
  }
  return result;
}

export async function setResultsContributor(userId: string, enabled: boolean): Promise<{ error: string | null }> {
  const access = await requireSuperAdmin();
  if (access.error) return access;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_results_contributor", { p_user_id: userId, p_enabled: enabled });
  if (!error) revalidatePath("/", "layout");
  return { error: error?.message ?? null };
}
