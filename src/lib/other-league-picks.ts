import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  planDestination,
  type CurtainCallDestination,
  type CurtainCallPick,
  type DraftQueueDestination,
  type GrandFinaleDestination,
  planQueueDestination,
} from "./copy-picks";

type Client = SupabaseClient<Database>;

export type OtherLeaguePicks = {
  curtainCall: CurtainCallDestination[];
  grandFinale: GrandFinaleDestination[];
};

// The viewer's own picks in their other leagues, each with whether a copy or
// pre-fill from/to it is currently possible. Reads only rows RLS already
// shows the viewer; the submit RPCs stay the authority on every write.
export async function loadOtherLeaguePicks(
  supabase: Client,
  {
    userId,
    currentLeagueId,
    curtainCallWeekId,
    includeGrandFinale,
    now,
  }: {
    userId: string;
    currentLeagueId: string;
    curtainCallWeekId: string | null;
    includeGrandFinale: boolean;
    now: Date;
  }
): Promise<OtherLeaguePicks> {
  const empty: OtherLeaguePicks = { curtainCall: [], grandFinale: [] };
  if (!curtainCallWeekId && !includeGrandFinale) return empty;

  const { data: memberships } = await supabase
    .from("league_members")
    .select("leagues(id, name)")
    .eq("user_id", userId);
  const others = (memberships ?? []).flatMap((m) => (m.leagues && m.leagues.id !== currentLeagueId ? [m.leagues] : []));
  if (others.length === 0) return empty;

  const otherIds = others.map((l) => l.id);
  const { data: settings } = await supabase
    .from("scoring_settings")
    .select("league_id, eliminations_category_enabled, bonus_picks_category_enabled")
    .in("league_id", otherIds);
  const settingsByLeague = new Map((settings ?? []).map((s) => [s.league_id, s]));

  const [curtainCall, grandFinale] = await Promise.all([
    curtainCallWeekId
      ? loadCurtainCall(supabase, userId, curtainCallWeekId, others, settingsByLeague, now)
      : [],
    includeGrandFinale ? loadGrandFinale(supabase, userId, others, settingsByLeague, now) : [],
  ]);
  return { curtainCall, grandFinale };
}

type League = { id: string; name: string };
type Settings = Map<
  string,
  { eliminations_category_enabled: boolean; bonus_picks_category_enabled: boolean }
>;

async function loadCurtainCall(
  supabase: Client,
  userId: string,
  weekId: string,
  leagues: League[],
  settings: Settings,
  now: Date
): Promise<CurtainCallDestination[]> {
  const { data: rows } = await supabase
    .from("predictions")
    .select("league_id, predicted_eliminated_couple_id, predicted_eliminated_couple_id_2, predicted_top_scorer_couple_id")
    .in("league_id", leagues.map((l) => l.id))
    .eq("week_id", weekId)
    .eq("manager_id", userId);
  const pickByLeague = new Map<string, CurtainCallPick>();
  for (const r of rows ?? []) {
    const pick = {
      elim1: r.predicted_eliminated_couple_id,
      elim2: r.predicted_eliminated_couple_id_2,
      topScorer: r.predicted_top_scorer_couple_id,
    };
    if (pick.elim1 || pick.elim2 || pick.topScorer) pickByLeague.set(r.league_id, pick);
  }

  return Promise.all(
    leagues.map(async (league) => {
      const moduleOn = settings.get(league.id)?.eliminations_category_enabled ?? true;
      const lockAt = moduleOn
        ? ((await supabase.rpc("prediction_lock_at", { p_league_id: league.id, p_week_id: weekId })).data ?? null)
        : null;
      const pick = pickByLeague.get(league.id) ?? null;
      return {
        id: league.id,
        name: league.name,
        pick,
        ...planDestination({
          moduleLabel: "Curtain Call",
          moduleOn,
          lockAt,
          missingLockIsLocked: false,
          hasPick: !!pick,
          now,
        }),
      };
    })
  );
}

async function loadGrandFinale(
  supabase: Client,
  userId: string,
  leagues: League[],
  settings: Settings,
  now: Date
): Promise<GrandFinaleDestination[]> {
  const { data: rows } = await supabase
    .from("grand_finale_predictions")
    .select("league_id, couple_id, predicted_position")
    .in("league_id", leagues.map((l) => l.id))
    .eq("manager_id", userId)
    .order("predicted_position", { ascending: true });
  const orderByLeague = new Map<string, string[]>();
  for (const r of rows ?? []) orderByLeague.set(r.league_id, [...(orderByLeague.get(r.league_id) ?? []), r.couple_id]);

  return Promise.all(
    leagues.map(async (league) => {
      const moduleOn = settings.get(league.id)?.bonus_picks_category_enabled ?? false;
      const lockAt = moduleOn
        ? ((await supabase.rpc("effective_grand_finale_deadline", { p_league_id: league.id })).data ?? null)
        : null;
      const order = orderByLeague.get(league.id) ?? null;
      return {
        id: league.id,
        name: league.name,
        order,
        ...planDestination({
          moduleLabel: "Grand Finale",
          moduleOn,
          lockAt,
          missingLockIsLocked: true,
          hasPick: !!order,
          now,
        }),
      };
    })
  );
}

// The viewer's draft queue in each of their other leagues. Queues are owner-only
// under RLS, so this only ever reads the viewer's own rows.
export async function loadOtherLeagueQueues(
  supabase: Client,
  { userId, currentLeagueId }: { userId: string; currentLeagueId: string }
): Promise<DraftQueueDestination[]> {
  const { data: memberships } = await supabase
    .from("league_members")
    .select("leagues(id, name, draft_status)")
    .eq("user_id", userId);
  const others = (memberships ?? []).flatMap((m) => (m.leagues && m.leagues.id !== currentLeagueId ? [m.leagues] : []));
  if (others.length === 0) return [];

  const otherIds = others.map((l) => l.id);
  const [{ data: settings }, { data: queues }] = await Promise.all([
    supabase.from("scoring_settings").select("league_id, judges_score_category_enabled").in("league_id", otherIds),
    supabase.from("draft_queues").select("league_id, couple_ids").in("league_id", otherIds).eq("user_id", userId),
  ]);
  const danceCardByLeague = new Map((settings ?? []).map((s) => [s.league_id, s.judges_score_category_enabled]));
  const queueByLeague = new Map(
    (queues ?? []).filter((q) => q.couple_ids.length > 0).map((q) => [q.league_id, q.couple_ids])
  );

  return others.map((league) => {
    const queue = queueByLeague.get(league.id) ?? null;
    return {
      id: league.id,
      name: league.name,
      queue,
      ...planQueueDestination({
        danceCardOn: danceCardByLeague.get(league.id) ?? true,
        draftCompleted: league.draft_status === "completed",
        hasQueue: !!queue,
      }),
    };
  });
}
