import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// Re-adding a name that is already archived is Restore, not a unique-constraint
// error — that's the obvious intent when someone types a guest back in.
export async function insertScoringJudge(
  admin: SupabaseClient<Database>,
  name: string
): Promise<{ error: string | null }> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Judge name is required" };

  const { data: existing, error: lookupError } = await admin
    .from("people")
    .select("id, archived_at")
    .eq("role", "judge")
    .eq("name", trimmed)
    .maybeSingle();
  if (lookupError) return { error: lookupError.message };

  if (existing) {
    if (existing.archived_at) {
      const { error } = await admin.from("people").update({ archived_at: null }).eq("id", existing.id);
      return { error: error?.message ?? null };
    }
    return { error: "A judge with that name already exists" };
  }

  const { error } = await admin.from("people").insert({ name: trimmed, role: "judge" });
  return { error: error?.message ?? null };
}

export async function setJudgeArchived(
  admin: SupabaseClient<Database>,
  personId: string,
  archived: boolean
): Promise<{ error: string | null }> {
  const { data: person, error: lookupError } = await admin
    .from("people")
    .select("id, role")
    .eq("id", personId)
    .maybeSingle();
  if (lookupError) return { error: lookupError.message };
  if (!person) return { error: "Judge not found" };
  if (person.role !== "judge") return { error: "Only scoring judges can be archived" };

  const { error } = await admin
    .from("people")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", personId);
  return { error: error?.message ?? null };
}
