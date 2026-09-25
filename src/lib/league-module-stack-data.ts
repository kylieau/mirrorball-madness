import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { buildCoupleDisplayNames, formatCoupleName } from "@/lib/couple-display";
import { nextPredictedElimination } from "@/lib/grand-finale-pins";
import type { LeagueHomeSummary } from "@/lib/league-home-summary";
import type { ModuleStackInput } from "@/lib/league-triage";
import { spoilerSafeCoupleStatus } from "@/lib/spoiler-safe-couple-status";

// The viewer's own per-module state for each league, batched into one query per table.
// spoilerCutoffWeek is the latest week the viewer may see results for; every
// eliminated couple beyond it is treated as still competing, so "next elim"
// can never reveal who went home.
export async function loadModuleStackInputs(
  supabase: SupabaseClient<Database>,
  summaries: LeagueHomeSummary[],
  context: { activeSeasonId: string | null; spoilerCutoffWeek: number | null; finaleWeekNumber: number | null }
): Promise<Map<string, ModuleStackInput>> {
  const leagueIds = summaries.map((s) => s.id);
  const [{ data: leagues }, { data: slots }, { data: couples }, { data: predictions }] = await Promise.all([
    supabase.from("leagues").select("id, draft_status").in("id", leagueIds),
    supabase.from("roster_slots").select("league_id, manager_id, couple_id").in("league_id", leagueIds).is("end_week", null),
    supabase
      .from("couples")
      .select(
        "id, season_id, status, elimination_week, celebrity:people!couples_celebrity_id_fkey(name), pro:people!couples_pro_id_fkey(name)"
      ),
    supabase
      .from("grand_finale_predictions")
      .select("league_id, manager_id, couple_id, predicted_position")
      .in("league_id", leagueIds)
      .in("manager_id", summaries.map((s) => s.myTeamId))
      .order("predicted_position", { ascending: true }),
  ]);
  const names = buildCoupleDisplayNames(
    (couples ?? []).map((c) => ({
      id: c.id,
      celebrity_name: c.celebrity?.name ?? "Unknown",
      pro_name: c.pro?.name ?? "Unknown",
    }))
  );
  const nameOf = (id: string | null) => (id ? (names.get(id)?.celebrity ?? null) : null);
  const fullNameOf = (id: string | null) => {
    const parts = id ? names.get(id) : null;
    return parts ? formatCoupleName(parts) : null;
  };
  const draftStatusByLeague = new Map((leagues ?? []).map((l) => [l.id, l.draft_status]));
  const seasonCouples = (couples ?? [])
    .filter((c) => c.season_id === context.activeSeasonId)
    .map((c) => ({
      id: c.id,
      celebrity_name: c.celebrity?.name ?? "Unknown",
      elimination_week: c.elimination_week,
      status: spoilerSafeCoupleStatus(
        { status: c.status, eliminationWeek: c.elimination_week },
        context.spoilerCutoffWeek,
        context.finaleWeekNumber
      ),
    }));

  return new Map(
    summaries.map((s) => {
      const order = (predictions ?? [])
        .filter((p) => p.league_id === s.id && p.manager_id === s.myTeamId)
        .map((p) => p.couple_id);
      return [
        s.id,
        {
          curtainCall: {
            on: s.curtainCallOn,
            state: s.curtainCall.state,
            afterWeek: context.spoilerCutoffWeek,
            lockAt: s.curtainCallLockAt,
            eliminatedName: nameOf(s.curtainCall.eliminatedCoupleId),
            topScorerName: nameOf(s.curtainCall.topScorerCoupleId),
          },
          danceCard: {
            on: s.danceCardOn,
            draftStatus: draftStatusByLeague.get(s.id) ?? "not_started",
            rosterNames: (slots ?? [])
              .filter((slot) => slot.league_id === s.id && slot.manager_id === s.myTeamId)
              .map((slot) => nameOf(slot.couple_id))
              .filter((name): name is string => !!name),
          },
          grandFinale: {
            on: s.grandFinaleOn,
            open: s.grandFinale.open,
            locked: s.grandFinale.locked,
            deadlineAt: s.grandFinale.deadlineAt,
            hasPrediction: s.grandFinale.hasPrediction,
            nextElimName: fullNameOf(nextPredictedElimination(order, seasonCouples)),
          },
        },
      ];
    })
  );
}
