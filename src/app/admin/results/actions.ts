"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  applyEpisodeSchedule,
  resultsEntryOpenToAll,
  type ScheduleEpisodeInput,
} from "@/lib/results";
import {
  saveDraftResults,
  addDraftCustomMoment,
  removeDraftCustomMoment,
  publishEpisodeDraft,
  startCorrection,
  type SaveDraftResultsInput,
} from "@/lib/results-draft";

// Returns userId alongside error so callers that need to stamp
// updatedBy/createdBy/publishedBy don't need a second auth round trip.
async function requireResultsAccess(): Promise<{ error: string | null; userId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", userId: "" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_super_admin && !resultsEntryOpenToAll()) return { error: "Not authorized", userId: "" };
  return { error: null, userId: user.id };
}

export async function scheduleEpisode(
  input: ScheduleEpisodeInput
): Promise<{ error: string | null }> {
  const access = await requireResultsAccess();
  if (access.error) return { error: access.error };

  const result = await applyEpisodeSchedule(createAdminClient(), input);
  if (!result.error) revalidatePath("/admin/results");
  return result;
}

export async function saveEpisodeDraft(
  input: Omit<SaveDraftResultsInput, "updatedBy">
): Promise<{ error: string | null }> {
  const access = await requireResultsAccess();
  if (access.error) return { error: access.error };

  const result = await saveDraftResults(createAdminClient(), { ...input, updatedBy: access.userId });
  if (!result.error) revalidatePath("/admin/results");
  return result;
}

export async function addEpisodeCustomMoment(input: {
  episodeId: string;
  coupleId: string | null;
  label: string;
}): Promise<{ error: string | null }> {
  const access = await requireResultsAccess();
  if (access.error) return { error: access.error };

  const result = await addDraftCustomMoment(createAdminClient(), { ...input, createdBy: access.userId });
  if (!result.error) revalidatePath("/admin/results");
  return result;
}

export async function removeEpisodeCustomMoment(momentId: string): Promise<{ error: string | null }> {
  const access = await requireResultsAccess();
  if (access.error) return { error: access.error };

  const result = await removeDraftCustomMoment(createAdminClient(), momentId);
  if (!result.error) revalidatePath("/admin/results");
  return result;
}

export async function publishEpisodeResults(episodeId: string): Promise<{ error: string | null }> {
  const access = await requireResultsAccess();
  if (access.error) return { error: access.error };

  const result = await publishEpisodeDraft(createAdminClient(), episodeId, access.userId);
  if (!result.error) revalidatePath("/admin/results");
  return result;
}

export async function startEpisodeCorrection(episodeId: string): Promise<{ error: string | null }> {
  const access = await requireResultsAccess();
  if (access.error) return { error: access.error };

  const result = await startCorrection(createAdminClient(), episodeId, access.userId);
  if (!result.error) revalidatePath("/admin/results");
  return result;
}

export async function addJudge(name: string): Promise<{ error: string | null }> {
  const access = await requireResultsAccess();
  if (access.error) return access;

  const trimmed = name.trim();
  if (!trimmed) return { error: "Judge name is required" };

  const { error } = await createAdminClient()
    .from("people")
    .insert({ name: trimmed, role: "judge" });
  if (error) return { error: error.message };

  revalidatePath("/admin/results");
  return { error: null };
}

export async function addDanceStyle(name: string): Promise<{ error: string | null }> {
  const access = await requireResultsAccess();
  if (access.error) return access;

  const trimmed = name.trim();
  if (!trimmed) return { error: "Dance style name is required" };

  const { error } = await createAdminClient().from("dance_styles").insert({ name: trimmed });
  if (error) return { error: error.message };

  revalidatePath("/admin/results");
  return { error: null };
}
