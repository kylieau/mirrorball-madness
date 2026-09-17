import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type JudgeRenameDecision =
  | { kind: "apply"; name: string }
  | { kind: "noop" }
  | { kind: "error"; error: string };

// Rename never merges identities — colliding with another judge (standing or
// archived) is always a conflict. Re-adding an archived name is Restore; that's
// insertScoringJudge, not this path.
export function resolveJudgeRename(
  current: { id: string; name: string; role: string } | null,
  proposedRaw: string,
  existingWithName: { id: string } | null
): JudgeRenameDecision {
  if (!current) return { kind: "error", error: "Judge not found" };
  if (current.role !== "judge") return { kind: "error", error: "Only scoring judges can be renamed" };

  const name = proposedRaw.trim();
  if (!name) return { kind: "error", error: "Judge name is required" };
  if (name === current.name) return { kind: "noop" };
  if (existingWithName && existingWithName.id !== current.id) {
    return { kind: "error", error: "A judge with that name already exists" };
  }
  return { kind: "apply", name };
}

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

export async function renameScoringJudge(
  admin: SupabaseClient<Database>,
  personId: string,
  name: string
): Promise<{ error: string | null }> {
  const { data: person, error: lookupError } = await admin
    .from("people")
    .select("id, role, name")
    .eq("id", personId)
    .maybeSingle();
  if (lookupError) return { error: lookupError.message };

  const { data: existing, error: conflictError } = await admin
    .from("people")
    .select("id")
    .eq("role", "judge")
    .eq("name", name.trim())
    .maybeSingle();
  if (conflictError) return { error: conflictError.message };

  const decision = resolveJudgeRename(person, name, existing);
  if (decision.kind === "error") return { error: decision.error };
  if (decision.kind === "noop") return { error: null };

  const { error } = await admin.from("people").update({ name: decision.name }).eq("id", personId);
  if (error?.code === "23505") return { error: "A judge with that name already exists" };
  return { error: error?.message ?? null };
}
