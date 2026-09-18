import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type PendingDeletionProfile = {
  id: string;
  display_name: string;
  deletion_requested_at: string | null;
};

export type PendingAccountDeletion = {
  id: string;
  displayName: string;
  email: string | null;
  deletionRequestedAt: string;
};

export function toPendingAccountDeletions(
  rows: PendingDeletionProfile[],
  emailsById: Record<string, string | undefined>
): PendingAccountDeletion[] {
  return rows
    .filter((row): row is PendingDeletionProfile & { deletion_requested_at: string } =>
      Boolean(row.deletion_requested_at)
    )
    .map((row) => ({
      id: row.id,
      displayName: row.display_name,
      email: emailsById[row.id] ?? null,
      deletionRequestedAt: row.deletion_requested_at,
    }));
}

export function resolveClearAccountDeletion(
  profile: { deletion_requested_at: string | null } | null
): { kind: "apply" } | { kind: "error"; error: string } {
  if (!profile) return { kind: "error", error: "Profile not found" };
  if (!profile.deletion_requested_at) {
    return { kind: "error", error: "No pending deletion request" };
  }
  return { kind: "apply" };
}

// Service-role reads: profiles RLS is owner/league-member only, and email
// lives on auth.users. Caller must already have verified is_super_admin.
export async function listPendingAccountDeletions(
  admin: SupabaseClient<Database>
): Promise<{ requests: PendingAccountDeletion[]; error: string | null }> {
  const { data, error } = await admin
    .from("profiles")
    .select("id, display_name, deletion_requested_at")
    .not("deletion_requested_at", "is", null)
    .order("deletion_requested_at", { ascending: true });
  if (error) return { requests: [], error: error.message };

  const emailsById: Record<string, string | undefined> = {};
  await Promise.all(
    (data ?? []).map(async (row) => {
      const { data: authUser } = await admin.auth.admin.getUserById(row.id);
      emailsById[row.id] = authUser?.user?.email ?? undefined;
    })
  );

  return { requests: toPendingAccountDeletions(data ?? [], emailsById), error: null };
}

// Clears the queue flag only — never deletes auth.users or league history.
export async function clearAccountDeletionRequest(
  admin: SupabaseClient<Database>,
  userId: string
): Promise<{ error: string | null }> {
  const trimmed = userId.trim();
  if (!trimmed) return { error: "User id is required" };

  const { data: profile, error: lookupError } = await admin
    .from("profiles")
    .select("deletion_requested_at")
    .eq("id", trimmed)
    .maybeSingle();
  if (lookupError) return { error: lookupError.message };

  const decision = resolveClearAccountDeletion(profile);
  if (decision.kind === "error") return { error: decision.error };

  const { error } = await admin
    .from("profiles")
    .update({ deletion_requested_at: null })
    .eq("id", trimmed);
  return { error: error?.message ?? null };
}
