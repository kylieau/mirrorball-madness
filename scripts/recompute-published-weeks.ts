// Recomputes weekly_manager_scores for every fully published week of the
// active season, through the same recomputeWeekScores the publish path uses —
// for applying a scoring-logic change retroactively without re-publishing each
// week by hand in Enter Results. Reads only already-stored results; writes
// only weekly_manager_scores. Run from the project root:
//
//   NODE_OPTIONS=--experimental-websocket npx tsx --env-file=.env.local scripts/recompute-published-weeks.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/types";
import { recomputeWeekScores } from "../src/lib/results";
import { RESOLVING_OUTCOMES, type Outcome } from "../src/lib/scoring";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Missing Supabase env (run with --env-file=.env.local)");

const admin = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });

async function snapshotScores(weekIds: string[]) {
  const { data, error } = await admin
    .from("weekly_manager_scores")
    .select("league_id, manager_id, week_id, total_points, prediction_points")
    .in("week_id", weekIds);
  if (error) throw new Error(error.message);
  return new Map(
    (data ?? []).map((r) => [`${r.league_id}:${r.manager_id}:${r.week_id}`, { total: r.total_points, pred: r.prediction_points }])
  );
}

async function main() {
  // Same resolution as active_season_id(), done directly — the service role
  // has no execute grant on that RPC.
  const { data: season, error: seasonErr } = await admin.from("seasons").select("id").eq("is_active", true).single();
  if (seasonErr || !season) throw new Error(seasonErr?.message ?? "No active season");
  const seasonId = season.id;

  const [{ data: weeks, error: weeksErr }, { data: episodes, error: episodesErr }] = await Promise.all([
    admin
      .from("competition_weeks")
      .select("id, week_number, is_double_elimination_week")
      .eq("season_id", seasonId)
      .order("week_number"),
    admin
      .from("episodes")
      .select("id, week_id, episode_number, results_published_at")
      .eq("season_id", seasonId)
      .not("week_id", "is", null),
  ]);
  if (weeksErr) throw new Error(weeksErr.message);
  if (episodesErr) throw new Error(episodesErr.message);

  const episodesByWeek = new Map<string, NonNullable<typeof episodes>>();
  for (const e of episodes ?? []) {
    const list = episodesByWeek.get(e.week_id!) ?? [];
    list.push(e);
    episodesByWeek.set(e.week_id!, list);
  }

  // Only weeks whose every episode is published: a week mid-reveal or still
  // being entered belongs to the live Enter Results flow, not this script.
  const publishedWeeks = (weeks ?? []).filter((w) => {
    const eps = episodesByWeek.get(w.id) ?? [];
    return eps.length > 0 && eps.every((e) => e.results_published_at !== null);
  });
  if (publishedWeeks.length === 0) {
    console.log("No fully published weeks — nothing to recompute.");
    return;
  }

  const before = await snapshotScores(publishedWeeks.map((w) => w.id));

  for (const week of publishedWeeks) {
    const eps = [...(episodesByWeek.get(week.id) ?? [])].sort((a, b) => a.episode_number - b.episode_number);
    const episodeIds = eps.map((e) => e.id);
    const { data: outcomeRows, error: outcomesErr } = await admin
      .from("episode_results")
      .select("episode_id, couple_id, outcome, bonus_points")
      .in("episode_id", episodeIds);
    if (outcomesErr) throw new Error(outcomesErr.message);

    // Mirror a re-publish: the episode whose rows carry the week's resolving
    // outcomes is "this" episode, so Grand Finale credits recompute exactly as
    // the real publish computed them. Fall back to the week's last episode.
    const resolvingEpisodeId = (outcomeRows ?? []).find((r) => RESOLVING_OUTCOMES.has(r.outcome as Outcome))?.episode_id;
    const thisEpisodeId = resolvingEpisodeId ?? episodeIds[episodeIds.length - 1];
    const thisEpisodeOutcomeRows = (outcomeRows ?? [])
      .filter((r) => r.episode_id === thisEpisodeId)
      .map((r) => ({ couple_id: r.couple_id, outcome: r.outcome, bonus_points: Number(r.bonus_points) }));

    const err = await recomputeWeekScores(admin, seasonId, week, episodeIds, thisEpisodeOutcomeRows, thisEpisodeId);
    if (err) throw new Error(`Week ${week.week_number}: ${err}`);
    console.log(`Week ${week.week_number} recomputed (${episodeIds.length} episode${episodeIds.length > 1 ? "s" : ""}).`);
  }

  const after = await snapshotScores(publishedWeeks.map((w) => w.id));
  let changed = 0;
  for (const [key, b] of before) {
    const a = after.get(key);
    if (!a || a.total !== b.total || a.pred !== b.pred) changed += 1;
  }
  for (const key of after.keys()) {
    if (!before.has(key)) changed += 1;
  }
  console.log(`Done: ${publishedWeeks.length} weeks, ${after.size} score rows, ${changed} changed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
