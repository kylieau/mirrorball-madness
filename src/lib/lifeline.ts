import { danceCardLedger, danceCardLedgerRule, type DanceCardLedger, type DanceCardWeek } from "./dance-card-v2";
import { roundPoints } from "./format-points";
import { NO_SURVIVAL_OUTCOMES, type Outcome } from "./scoring";
import { danceCardPriorWeeks } from "./weekly-score-rows";

// Lifeline (Kylie, 2026-11-10; docs/design/lifeline-recast-trades/): a
// manager whose roster spot is dead picks a living couple they don't own each
// week, and gets this share of that couple's Dance Card credit for the week.
export const LIFELINE_SHARE = 0.5;

export type LifelinePick = {
  league_id: string;
  manager_id: string;
  week_id: string;
  slot_number: number;
  couple_id: string;
};
export type LifelinePayout = LifelinePick & {
  credit: number;
  survived: boolean;
  points: number;
  weighted_points: number;
};
export type LifelineEqualizerDetail = { weeks: number[]; slotWeeks: number };
export type LifelineEqualizer = {
  managerId: string;
  points: number;
  weightedPoints: number;
  detail: LifelineEqualizerDetail;
};

// The season as Lifeline reads it. danceCardWeeks is every week with live
// dances, the way the Dance Card ledger takes them (settled outcomes only);
// couples carry the status they have once this publish commits.
export type LifelineSeason = {
  weeks: { id: string; week_number: number; is_finale: boolean }[];
  danceCardWeeks: DanceCardWeek[];
  couples: { id: string; status: string; elimination_week: number | null }[];
  leagues: { id: string; roster_size: number; lifeline_starts_week?: number | null }[];
  settings: {
    league_id: string;
    dance_card_version?: string | null;
    judges_score_starts_week: number;
    judges_score_category_weight: number;
  }[];
  rosters: {
    league_id: string;
    manager_id: string;
    slot_number: number;
    couple_id: string | null;
    start_week: number;
    end_week: number | null;
  }[];
};

// The whole season from live rows (dance_card_snapshot's shape), for anything
// computed outside a publish.
export function lifelineSeason(
  snapshot: Parameters<typeof danceCardPriorWeeks>[0] & Pick<LifelineSeason, "weeks" | "couples" | "leagues" | "settings" | "rosters">
): LifelineSeason {
  return {
    weeks: snapshot.weeks,
    danceCardWeeks: danceCardPriorWeeks(snapshot, Infinity),
    couples: snapshot.couples,
    leagues: snapshot.leagues,
    settings: snapshot.settings,
    rosters: snapshot.rosters,
  };
}

type LeagueLifeline = {
  anchorWeek: number;
  weight: number;
  ledger: DanceCardLedger;
};

function leagueLifeline(season: LifelineSeason, leagueId: string): LeagueLifeline | null {
  const league = season.leagues.find((l) => l.id === leagueId);
  const settings = season.settings.find((s) => s.league_id === leagueId);
  const rule = league && settings ? danceCardLedgerRule(settings.dance_card_version, league.roster_size) : null;
  if (!settings || !rule) return null;
  return {
    anchorWeek: settings.judges_score_starts_week,
    weight: Number(settings.judges_score_category_weight),
    ledger: danceCardLedger(season.danceCardWeeks, settings.judges_score_starts_week, rule),
  };
}

// A couple survives a week the way Dance Card v3 counts it: a settled outcome
// and none of them eliminated, withdrawn or bye.
function survivedWeek(season: LifelineSeason, coupleId: string, weekNumber: number): boolean {
  const outcomes = (season.danceCardWeeks.find((w) => w.weekNumber === weekNumber)?.outcomes ?? []).filter(
    (o) => o.coupleId === coupleId
  );
  return outcomes.length > 0 && outcomes.every((o) => !NO_SURVIVAL_OUTCOMES.has(o.outcome as Outcome));
}

// What one Lifeline on this couple is worth that week, unrounded and before
// the Dance Card weight. A couple that goes home still pays (Kylie,
// 2026-11-10): its credit that week just has no survival step in it.
function lifelineValue(season: LifelineSeason, league: LeagueLifeline, coupleId: string, weekNumber: number) {
  const credit = (league.ledger.get(coupleId)?.get(weekNumber)?.creditCents ?? 0) / 100;
  return { credit, survived: survivedWeek(season, coupleId, weekNumber), value: Math.max(0, LIFELINE_SHARE * credit) };
}

// A roster spot is dead for a week when the couple holding it that week went
// home in an earlier one. Mirrors lifeline_slot_is_dead().
export function isDeadSlot(
  season: Pick<LifelineSeason, "rosters" | "couples">,
  leagueId: string,
  managerId: string,
  slotNumber: number,
  weekNumber: number
): boolean {
  return season.rosters.some((slot) => {
    if (slot.league_id !== leagueId || slot.manager_id !== managerId || slot.slot_number !== slotNumber) return false;
    if (slot.start_week > weekNumber || (slot.end_week != null && slot.end_week < weekNumber)) return false;
    const couple = season.couples.find((c) => c.id === slot.couple_id);
    return (
      !!couple &&
      (couple.status === "eliminated" || couple.status === "withdrawn") &&
      couple.elimination_week != null &&
      couple.elimination_week < weekNumber
    );
  });
}

// One payout per pick. A pick whose spot isn't dead any more (a correction
// brought its couple back) pays nothing.
export function buildLifelinePayouts(season: LifelineSeason, picks: LifelinePick[]): LifelinePayout[] {
  const leagues = new Map<string, LeagueLifeline | null>();
  return picks.map((pick) => {
    if (!leagues.has(pick.league_id)) leagues.set(pick.league_id, leagueLifeline(season, pick.league_id));
    const league = leagues.get(pick.league_id);
    const weekNumber = season.weeks.find((w) => w.id === pick.week_id)?.week_number;
    const row = { league_id: pick.league_id, manager_id: pick.manager_id, week_id: pick.week_id, slot_number: pick.slot_number, couple_id: pick.couple_id };
    if (!league || weekNumber === undefined || weekNumber < league.anchorWeek)
      return { ...row, credit: 0, survived: false, points: 0, weighted_points: 0 };
    const { credit, survived, value } = lifelineValue(season, league, pick.couple_id, weekNumber);
    const points = isDeadSlot(season, pick.league_id, pick.manager_id, pick.slot_number, weekNumber) ? roundPoints(value) : 0;
    return { ...row, credit: roundPoints(credit), survived, points, weighted_points: roundPoints(points * league.weight) };
  });
}

// The Equalizer: for every week a manager's spot was dead before Lifeline
// started (from the Anchor Week), the average Lifeline that week, which is
// the mean over the couples that danced of what a pick on each would have
// paid. One amount per manager, rounded once.
export function buildLifelineEqualizer(season: LifelineSeason, leagueId: string, startsWeek: number): LifelineEqualizer[] {
  const league = leagueLifeline(season, leagueId);
  if (!league) return [];
  const averageByWeek = new Map<number, number>();
  for (const week of season.danceCardWeeks) {
    if (week.weekNumber < league.anchorWeek || week.weekNumber >= startsWeek) continue;
    const danced = [...new Set(week.danceScores.map((d) => d.coupleId))];
    if (danced.length === 0) continue;
    const total = danced.reduce((sum, coupleId) => sum + lifelineValue(season, league, coupleId, week.weekNumber).value, 0);
    averageByWeek.set(week.weekNumber, total / danced.length);
  }
  const byManager = new Map<string, { value: number; weeks: Set<number>; slotWeeks: number }>();
  for (const slot of season.rosters) {
    if (slot.league_id !== leagueId) continue;
    for (const [weekNumber, average] of averageByWeek) {
      if (slot.start_week > weekNumber || (slot.end_week != null && slot.end_week < weekNumber)) continue;
      if (!isDeadSlot(season, leagueId, slot.manager_id, slot.slot_number, weekNumber)) continue;
      const entry = byManager.get(slot.manager_id) ?? { value: 0, weeks: new Set<number>(), slotWeeks: 0 };
      entry.value += average;
      entry.weeks.add(weekNumber);
      entry.slotWeeks += 1;
      byManager.set(slot.manager_id, entry);
    }
  }
  return [...byManager].map(([managerId, { value, weeks, slotWeeks }]) => {
    const points = roundPoints(value);
    return {
      managerId,
      points,
      weightedPoints: roundPoints(points * league.weight),
      detail: { weeks: [...weeks].sort((a, b) => a - b), slotWeeks },
    };
  });
}

// Stored Equalizers with today's amounts: a correction to an earlier week
// moves the credits they average. A manager whose dead weeks are gone drops
// to zero; one who had none when it was confirmed gains none.
export function recomputeLifelineEqualizers(
  season: LifelineSeason,
  stored: { id: string; league_id: string; manager_id: string }[]
): { id: string; points: number; weighted_points: number; detail: LifelineEqualizerDetail }[] {
  const byLeague = new Map<string, LifelineEqualizer[]>();
  return stored.map((row) => {
    if (!byLeague.has(row.league_id)) {
      const startsWeek = season.leagues.find((l) => l.id === row.league_id)?.lifeline_starts_week;
      byLeague.set(row.league_id, startsWeek == null ? [] : buildLifelineEqualizer(season, row.league_id, startsWeek));
    }
    const current = byLeague.get(row.league_id)!.find((e) => e.managerId === row.manager_id);
    return {
      id: row.id,
      points: current?.points ?? 0,
      weighted_points: current?.weightedPoints ?? 0,
      detail: current?.detail ?? { weeks: [], slotWeeks: 0 },
    };
  });
}

export type LifelinePreviewRow = {
  managerId: string;
  equalizer: number;
  slotWeeks: number;
  weeks: number[];
  before: number;
  after: number;
  rankBefore: number;
  rankAfter: number;
};

// What the commissioner confirms: every manager's Equalizer (in total-points
// units) beside the standings without and with it. Ranks are leaderboard
// positions, so `managers` is in the leaderboard's tie order.
export function lifelineStandingsPreview(
  managers: { managerId: string; total: number }[],
  equalizer: LifelineEqualizer[]
): LifelinePreviewRow[] {
  const rows = managers.map(({ managerId, total }) => {
    const share = equalizer.find((e) => e.managerId === managerId);
    return {
      managerId,
      equalizer: share?.weightedPoints ?? 0,
      slotWeeks: share?.detail.slotWeeks ?? 0,
      weeks: share?.detail.weeks ?? [],
      before: roundPoints(total),
      after: roundPoints(total + (share?.weightedPoints ?? 0)),
    };
  });
  const rankBy = (key: "before" | "after") =>
    new Map([...rows].sort((a, b) => b[key] - a[key]).map((row, i) => [row.managerId, i + 1]));
  const before = rankBy("before");
  const after = rankBy("after");
  return rows
    .map((row) => ({ ...row, rankBefore: before.get(row.managerId)!, rankAfter: after.get(row.managerId)! }))
    .sort((a, b) => a.rankAfter - b.rankAfter);
}
