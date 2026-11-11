import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import type { DanceCardSnapshot } from "./dance-card-refresh";
import {
  buildLifelineEqualizer,
  lifelineSeason,
  lifelineStandingsPreview,
  type LifelineEqualizer,
  type LifelinePreviewRow,
} from "./lifeline";
import { formatManagerName } from "./manager-display";
import { loadWeeklyStandings } from "./weekly-standings";

export type LifelinePreview = {
  startsWeek: number;
  // What the commissioner saw; confirming with stale numbers is refused.
  token: string;
  rows: (LifelinePreviewRow & { displayName: string })[];
};

const NUMBERS_CHANGED = "The numbers changed. Review Lifeline again.";

// The Equalizer as a dry run: nothing is written. `admin` is the service
// client, and the caller has already checked who is asking.
async function computeLifelinePreview(
  admin: SupabaseClient<Database>,
  leagueId: string
): Promise<{ error: string } | { preview: LifelinePreview; equalizer: LifelineEqualizer[] }> {
  const [{ data: startsWeek, error: startsError }, { data: snapshotData, error: snapshotError }, { data: members }, standings] =
    await Promise.all([
      admin.rpc("lifeline_first_open_week", { p_league_id: leagueId }),
      admin.rpc("dance_card_snapshot"),
      admin
        .from("league_members")
        .select(
          "user_id, profiles!league_members_user_id_fkey(display_name), co_manager:profiles!league_members_co_manager_id_fkey(display_name)"
        )
        .eq("league_id", leagueId)
        .order("joined_at"),
      loadWeeklyStandings(admin, leagueId),
    ]);
  if (startsError || snapshotError) return { error: (startsError ?? snapshotError)!.message };
  if (startsWeek == null) return { error: "No week is left to play Lifeline" };
  const snapshot = snapshotData as unknown as DanceCardSnapshot;

  const weekNumberById = new Map(snapshot.weeks.map((week) => [week.id, week.week_number]));
  const unpublished = snapshot.episodes.some(
    (episode) =>
      episode.week_id != null && weekNumberById.get(episode.week_id)! < startsWeek && episode.results_published_at == null
  );
  if (unpublished) return { error: "Lifeline can be turned on once this week's results are in" };

  const equalizer = buildLifelineEqualizer(lifelineSeason(snapshot), leagueId, startsWeek).filter((row) => row.points > 0);
  const totals = new Map<string, number>();
  for (const row of standings) {
    if (weekNumberById.has(row.week_id)) totals.set(row.manager_id, (totals.get(row.manager_id) ?? 0) + row.total_points);
  }
  const names = new Map(
    (members ?? []).map((m) => [
      m.user_id,
      formatManagerName({
        displayName: m.profiles?.display_name ?? "Unknown",
        coManagerDisplayName: m.co_manager?.display_name,
      }),
    ])
  );
  const rows = lifelineStandingsPreview(
    (members ?? []).map((m) => ({ managerId: m.user_id, total: totals.get(m.user_id) ?? 0 })),
    equalizer
  );
  const token = createHash("sha256").update(JSON.stringify({ startsWeek, equalizer, rows })).digest("hex");
  return {
    equalizer,
    preview: {
      startsWeek,
      token,
      rows: rows.map((row) => ({ ...row, displayName: names.get(row.managerId) ?? "Unknown" })),
    },
  };
}

export async function loadLifelinePreview(
  admin: SupabaseClient<Database>,
  leagueId: string
): Promise<{ error: string } | { preview: LifelinePreview }> {
  const result = await computeLifelinePreview(admin, leagueId);
  return "error" in result ? result : { preview: result.preview };
}

// Turns Lifeline on with the numbers the commissioner confirmed, or with no
// Equalizer at all. enable_lifeline checks the actor again.
export async function confirmLifeline(
  admin: SupabaseClient<Database>,
  leagueId: string,
  actorId: string,
  token: string,
  includeEqualizer: boolean
): Promise<{ error: string | null }> {
  const result = await computeLifelinePreview(admin, leagueId);
  if ("error" in result) return result;
  if (result.preview.token !== token) return { error: NUMBERS_CHANGED };
  const { error } = await admin.rpc("enable_lifeline", {
    p_league_id: leagueId,
    p_actor_id: actorId,
    p_starts_week: result.preview.startsWeek,
    p_equalizer: (includeEqualizer
      ? result.equalizer.map((row) => ({
          manager_id: row.managerId,
          points: row.points,
          weighted_points: row.weightedPoints,
          detail: row.detail,
        }))
      : []) as Json,
  });
  return { error: error?.message ?? null };
}
