"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  applyEpisodeSchedule,
  userIsAnyLeagueCommissioner,
  type ScheduleEpisodeInput,
} from "@/lib/results";
import {
  saveDraftResults,
  addDraftCustomMoment,
  removeDraftCustomMoment,
  publishEpisodeDraft,
  startCorrection,
  applySeasonSettings,
  type SaveDraftResultsInput,
  type SeasonSettingsInput,
} from "@/lib/results-draft";
import { insertScoringJudge, renameScoringJudge, setJudgeArchived } from "@/lib/admin-people";

// Both checks return userId alongside error so callers that need to stamp
// updatedBy/createdBy/publishedBy don't need a second auth round trip.
async function currentUser(): Promise<{ userId: string; isSuperAdmin: boolean } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .single();

  return { userId: user.id, isSuperAdmin: profile?.is_super_admin ?? false };
}

// Propose tier: drafting results changes nothing live until Publish, so any
// league's commissioner can do it. Publish itself stays admin-only below.
async function requireProposeAccess(): Promise<{ error: string | null; userId: string }> {
  const user = await currentUser();
  if (!user) return { error: "Not authenticated", userId: "" };
  if (user.isSuperAdmin) return { error: null, userId: user.userId };

  const isCommissioner = await userIsAnyLeagueCommissioner(createAdminClient(), user.userId);
  if (!isCommissioner) return { error: "Not authorized", userId: "" };
  return { error: null, userId: user.userId };
}

// Admin tier: publishing recomputes scores for every league at once, and
// schedule/show settings are season-wide structural config.
async function requireAdminAccess(): Promise<{ error: string | null; userId: string }> {
  const user = await currentUser();
  if (!user) return { error: "Not authenticated", userId: "" };
  if (!user.isSuperAdmin) return { error: "Not authorized", userId: "" };
  return { error: null, userId: user.userId };
}

export async function scheduleEpisode(
  input: ScheduleEpisodeInput
): Promise<{ error: string | null }> {
  const access = await requireAdminAccess();
  if (access.error) return { error: access.error };

  const result = await applyEpisodeSchedule(createAdminClient(), input);
  if (!result.error) {
    revalidatePath("/admin/results");
    revalidatePath("/admin/schedule");
  }
  return result;
}

export async function saveEpisodeDraft(
  input: Omit<SaveDraftResultsInput, "updatedBy">
): Promise<{ error: string | null }> {
  const access = await requireProposeAccess();
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
  const access = await requireProposeAccess();
  if (access.error) return { error: access.error };

  const result = await addDraftCustomMoment(createAdminClient(), { ...input, createdBy: access.userId });
  if (!result.error) revalidatePath("/admin/results");
  return result;
}

export async function removeEpisodeCustomMoment(momentId: string): Promise<{ error: string | null }> {
  const access = await requireProposeAccess();
  if (access.error) return { error: access.error };

  const result = await removeDraftCustomMoment(createAdminClient(), momentId);
  if (!result.error) revalidatePath("/admin/results");
  return result;
}

export async function publishEpisodeResults(episodeId: string): Promise<{ error: string | null }> {
  const access = await requireAdminAccess();
  if (access.error) return { error: access.error };

  const result = await publishEpisodeDraft(createAdminClient(), episodeId, access.userId);
  if (!result.error) {
    revalidatePath("/admin/results");
    revalidatePath("/admin/schedule");
  }
  return result;
}

export async function startEpisodeCorrection(episodeId: string): Promise<{ error: string | null }> {
  const access = await requireProposeAccess();
  if (access.error) return { error: access.error };

  const result = await startCorrection(createAdminClient(), episodeId, access.userId);
  if (!result.error) revalidatePath("/admin/results");
  return result;
}

export async function updateSeasonSettings(input: SeasonSettingsInput): Promise<{ error: string | null }> {
  const access = await requireAdminAccess();
  if (access.error) return { error: access.error };

  const result = await applySeasonSettings(createAdminClient(), input);
  if (!result.error) {
    revalidatePath("/admin/results");
    revalidatePath("/admin/schedule");
  }
  return result;
}

export async function addJudge(name: string): Promise<{ error: string | null }> {
  const access = await requireAdminAccess();
  if (access.error) return access;

  const result = await insertScoringJudge(createAdminClient(), name);
  if (!result.error) {
    revalidatePath("/admin/results");
    revalidatePath("/admin/show-settings");
  }
  return result;
}

export async function archiveJudge(personId: string): Promise<{ error: string | null }> {
  const access = await requireAdminAccess();
  if (access.error) return access;

  const result = await setJudgeArchived(createAdminClient(), personId, true);
  if (!result.error) {
    revalidatePath("/admin/results");
    revalidatePath("/admin/show-settings");
  }
  return result;
}

export async function restoreJudge(personId: string): Promise<{ error: string | null }> {
  const access = await requireAdminAccess();
  if (access.error) return access;

  const result = await setJudgeArchived(createAdminClient(), personId, false);
  if (!result.error) {
    revalidatePath("/admin/results");
    revalidatePath("/admin/show-settings");
  }
  return result;
}

export async function renameJudge(personId: string, name: string): Promise<{ error: string | null }> {
  const access = await requireAdminAccess();
  if (access.error) return access;

  const result = await renameScoringJudge(createAdminClient(), personId, name);
  if (!result.error) {
    revalidatePath("/admin/results");
    revalidatePath("/admin/show-settings");
  }
  return result;
}

export async function addDanceStyle(name: string): Promise<{ error: string | null }> {
  const access = await requireAdminAccess();
  if (access.error) return access;

  const trimmed = name.trim();
  if (!trimmed) return { error: "Dance style name is required" };

  const { error } = await createAdminClient().from("dance_styles").insert({ name: trimmed });
  if (error) return { error: error.message };

  revalidatePath("/admin/results");
  revalidatePath("/admin/show-settings");
  return { error: null };
}

const DANCE_STYLE_CATEGORIES = ["ballroom", "latin", "show"] as const;
type DanceStyleCategory = (typeof DANCE_STYLE_CATEGORIES)[number];

export async function addRoundType(name: string): Promise<{ error: string | null }> {
  const access = await requireAdminAccess();
  if (access.error) return access;

  const trimmed = name.trim();
  if (!trimmed) return { error: "Round type name is required" };

  const { error } = await createAdminClient().from("round_types").insert({ name: trimmed });
  if (error) return { error: error.message };

  revalidatePath("/admin/results");
  revalidatePath("/admin/show-settings");
  return { error: null };
}

export async function setDanceStyleCategory(
  styleId: string,
  category: DanceStyleCategory | null
): Promise<{ error: string | null }> {
  const access = await requireAdminAccess();
  if (access.error) return access;

  if (category !== null && !DANCE_STYLE_CATEGORIES.includes(category)) {
    return { error: "Category must be Ballroom, Latin, or Show." };
  }

  const { error } = await createAdminClient()
    .from("dance_styles")
    .update({ category })
    .eq("id", styleId);
  if (error) return { error: error.message };

  revalidatePath("/admin/results");
  revalidatePath("/admin/show-settings");
  return { error: null };
}
