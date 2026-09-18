"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clearAccountDeletionRequest } from "@/lib/account-deletions";

// Stricter than results entry: RESULTS_ENTRY_OPEN_TO_ALL must not expose
// this queue (emails + user ids).
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
