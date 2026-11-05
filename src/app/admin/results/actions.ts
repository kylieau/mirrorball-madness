"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  applyEpisodeSchedule,
  userCanProposeResults,
  type ScheduleEpisodeInput,
} from "@/lib/results";
import {
  saveDraftResults,
  releaseDraftCouple,
  withdrawDraftCouple,
  startCorrection,
  applySeasonSettings,
  type SaveDraftResultsInput,
  type SaveDraftResultsOutcome,
  type SeasonSettingsInput,
} from "@/lib/results-draft";
import { publishEpisodeAtomically } from "@/lib/episode-publication";
import { revealCouple, revealTeam, undoReveal, undoTeamReveal } from "@/lib/results-reveal";
import { insertScoringJudge, renameScoringJudge, setJudgeArchived } from "@/lib/admin-people";
import {
  deleteSpecialDance,
  saveSpecialDance,
  saveSpecialDancePoints,
  saveTeamCoupleMarks,
  saveTeamMarks,
  setSpecialDraftRelease,
} from "@/lib/episode-teams";
import { saveRoundException, setRoundBonus } from "@/lib/episode-rounds-data";
import type { ExceptionKind } from "@/lib/episode-rounds";
import type { SpecialDanceScore, SpecialDanceSetupInput, TeamMark } from "@/lib/team-dances";

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

// Trusted contributors can draft/release results; publication stays admin-only.
async function requireProposeAccess(): Promise<{ error: string | null; userId: string }> {
  const user = await currentUser();
  if (!user) return { error: "Not authenticated", userId: "" };
  if (user.isSuperAdmin) return { error: null, userId: user.userId };

  const canPropose = await userCanProposeResults(createAdminClient(), user.userId);
  if (!canPropose) return { error: "Not authorized", userId: "" };
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

  const result = await applyEpisodeSchedule(createAdminClient(), input, access.userId);
  if (!result.error) {
    revalidatePath("/admin/results", "layout");
    revalidatePath("/admin/schedule");
  }
  return result;
}

export async function saveEpisodeDraft(
  input: Omit<SaveDraftResultsInput, "updatedBy">
): Promise<SaveDraftResultsOutcome> {
  const access = await requireProposeAccess();
  if (access.error) return { error: access.error, acknowledgedIds: [], skippedPostedIds: [] };

  const result = await saveDraftResults(createAdminClient(), { ...input, updatedBy: access.userId });
  if (!result.error) revalidatePath("/admin/results", "layout");
  return result;
}

// Special dance setup (type, participants, style, songs, scoring, details) is
// propose tier, so whoever is entering scores live can create a dance-off as
// it airs. The RPC keeps a published week site-admin only.
export async function saveSpecialDanceAction(input: {
  episodeId: string;
  dance: SpecialDanceSetupInput;
}): Promise<{ error: string | null; result?: { id: string } }> {
  const access = await requireProposeAccess();
  if (access.error) return { error: access.error };

  const result = await saveSpecialDance(createAdminClient(), input, access.userId);
  if (!result.error) revalidatePath("/admin/results", "layout");
  return result;
}

export async function deleteSpecialDanceAction(input: { episodeId: string; teamId: string }): Promise<{ error: string | null }> {
  const access = await requireProposeAccess();
  if (access.error) return { error: access.error };

  const result = await deleteSpecialDance(createAdminClient(), input, access.userId);
  if (!result.error) revalidatePath("/admin/results", "layout");
  return result;
}

// Entering a special dance's marks is draft entry (propose tier); posting
// them is the admin reveal below.
export async function saveTeamMarksAction(input: {
  episodeId: string;
  teamId: string;
  marks: TeamMark[];
}): Promise<{ error: string | null }> {
  const access = await requireProposeAccess();
  if (access.error) return { error: access.error };

  const result = await saveTeamMarks(createAdminClient(), input, access.userId);
  if (!result.error) revalidatePath("/admin/results", "layout");
  return result;
}

// One participant's marks in a heat judged couple by couple: same tier as
// marks.
export async function saveTeamCoupleMarksAction(input: {
  episodeId: string;
  teamId: string;
  coupleId: string;
  marks: TeamMark[];
}): Promise<{ error: string | null }> {
  const access = await requireProposeAccess();
  if (access.error) return { error: access.error };

  const result = await saveTeamCoupleMarks(createAdminClient(), input, access.userId);
  if (!result.error) revalidatePath("/admin/results", "layout");
  return result;
}

// Immune, Not Dancing or Withdrawn, marked or undone on Enter Results by
// whoever is entering scores. The RPC moves the couple's draft outcome too.
export async function saveRoundExceptionAction(input: {
  episodeId: string;
  coupleId: string;
  roundIds: string[];
  kind: ExceptionKind | null;
  note: string | null;
  bonusPoints: number | null;
}): Promise<{ error: string | null }> {
  const access = await requireProposeAccess();
  if (access.error) return { error: access.error };

  const result = await saveRoundException(createAdminClient(), input, access.userId);
  if (!result.error) revalidatePath("/admin/results", "layout");
  return result;
}

// The winner's bonus, set when the show announces it.
export async function setRoundBonusAction(input: {
  episodeId: string;
  roundId: string;
  bonusPoints: number | null;
}): Promise<{ error: string | null }> {
  const access = await requireProposeAccess();
  if (access.error) return { error: access.error };

  const result = await setRoundBonus(createAdminClient(), input, access.userId);
  if (!result.error) revalidatePath("/admin/results", "layout");
  return result;
}

// Points and results for a Points-mode special dance: draft entry, same tier
// as marks.
export async function saveSpecialDancePointsAction(input: {
  episodeId: string;
  teamId: string;
  scores: SpecialDanceScore[];
}): Promise<{ error: string | null }> {
  const access = await requireProposeAccess();
  if (access.error) return { error: access.error };

  const result = await saveSpecialDancePoints(createAdminClient(), input, access.userId);
  if (!result.error) revalidatePath("/admin/results", "layout");
  return result;
}

// Posting a team recomputes every league's judges points, like posting a couple.
export async function revealTeamScores(input: { episodeId: string; teamId: string }): Promise<{ error: string | null }> {
  const access = await requireAdminAccess();
  if (access.error) return { error: access.error };

  const result = await revealTeam(createAdminClient(), input, access.userId);
  if (!result.error) revalidatePath("/admin/results", "layout");
  return result;
}

export async function undoTeamScores(input: { episodeId: string; teamId: string }): Promise<{ error: string | null }> {
  const access = await requireAdminAccess();
  if (access.error) return { error: access.error };

  const result = await undoTeamReveal(createAdminClient(), input, access.userId);
  if (!result.error) revalidatePath("/admin/results", "layout");
  return result;
}

// Trusted contributors can release a couple globally; official publication stays admin-only.
export async function releaseDraftCoupleAction(episodeId: string, coupleId: string): Promise<{ error: string | null }> {
  const access = await requireProposeAccess();
  if (access.error) return { error: access.error };

  const result = await releaseDraftCouple(createAdminClient(), episodeId, coupleId, access.userId);
  if (!result.error) revalidatePath("/", "layout");
  return result;
}

export async function withdrawDraftCoupleAction(episodeId: string, coupleId: string): Promise<{ error: string | null }> {
  const access = await requireProposeAccess();
  if (access.error) return { error: access.error };

  const result = await withdrawDraftCouple(createAdminClient(), episodeId, coupleId, access.userId);
  if (!result.error) revalidatePath("/", "layout");
  return result;
}

export async function setSpecialDraftReleaseAction(input: { episodeId: string; teamId: string; release: boolean }): Promise<{ error: string | null }> {
  const access = await requireProposeAccess();
  if (access.error) return { error: access.error };

  const result = await setSpecialDraftRelease(createAdminClient(), input, access.userId);
  if (!result.error) revalidatePath("/", "layout");
  return result;
}

export async function publishEpisodeResults(episodeId: string): Promise<{ error: string | null }> {
  const access = await requireAdminAccess();
  if (access.error) return { error: access.error };

  const result = await publishEpisodeAtomically(createAdminClient(), episodeId, access.userId);
  if (!result.error) {
    revalidatePath("/admin/results", "layout");
    revalidatePath("/admin/schedule");
  }
  return result;
}

export async function revealCoupleScores(input: {
  episodeId: string;
  coupleId: string;
}): Promise<{ error: string | null }> {
  const access = await requireAdminAccess();
  if (access.error) return { error: access.error };

  const result = await revealCouple(createAdminClient(), input, access.userId);
  if (!result.error) revalidatePath("/admin/results", "layout");
  return result;
}

export async function undoCoupleReveal(input: {
  episodeId: string;
  coupleId: string;
}): Promise<{ error: string | null }> {
  const access = await requireAdminAccess();
  if (access.error) return { error: access.error };

  const result = await undoReveal(createAdminClient(), input, access.userId);
  if (!result.error) revalidatePath("/admin/results", "layout");
  return result;
}

export async function startEpisodeCorrection(episodeId: string): Promise<{ error: string | null }> {
  const access = await requireAdminAccess();
  if (access.error) return { error: access.error };

  const result = await startCorrection(createAdminClient(), episodeId, access.userId);
  if (!result.error) revalidatePath("/admin/results", "layout");
  return result;
}

export async function updateSeasonSettings(input: SeasonSettingsInput): Promise<{ error: string | null }> {
  const access = await requireAdminAccess();
  if (access.error) return { error: access.error };

  const result = await applySeasonSettings(createAdminClient(), input);
  if (!result.error) {
    revalidatePath("/admin/results", "layout");
    revalidatePath("/admin/schedule");
  }
  return result;
}

export async function addJudge(name: string): Promise<{ error: string | null }> {
  const access = await requireAdminAccess();
  if (access.error) return access;

  const result = await insertScoringJudge(createAdminClient(), name);
  if (!result.error) {
    revalidatePath("/admin/results", "layout");
    revalidatePath("/admin/show-settings");
  }
  return result;
}

export async function archiveJudge(personId: string): Promise<{ error: string | null }> {
  const access = await requireAdminAccess();
  if (access.error) return access;

  const result = await setJudgeArchived(createAdminClient(), personId, true);
  if (!result.error) {
    revalidatePath("/admin/results", "layout");
    revalidatePath("/admin/show-settings");
  }
  return result;
}

export async function restoreJudge(personId: string): Promise<{ error: string | null }> {
  const access = await requireAdminAccess();
  if (access.error) return access;

  const result = await setJudgeArchived(createAdminClient(), personId, false);
  if (!result.error) {
    revalidatePath("/admin/results", "layout");
    revalidatePath("/admin/show-settings");
  }
  return result;
}

export async function renameJudge(personId: string, name: string): Promise<{ error: string | null }> {
  const access = await requireAdminAccess();
  if (access.error) return access;

  const result = await renameScoringJudge(createAdminClient(), personId, name);
  if (!result.error) {
    revalidatePath("/admin/results", "layout");
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

  revalidatePath("/admin/results", "layout");
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

  revalidatePath("/admin/results", "layout");
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

  revalidatePath("/admin/results", "layout");
  revalidatePath("/admin/show-settings");
  return { error: null };
}
