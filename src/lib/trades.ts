import { releaseEffectiveWeek } from "./remove-manager";

export type TradeLeg = { fromManagerId: string; toManagerId: string; coupleId: string | null; points: number | null };

export type TradeStatus =
  | "proposed"
  | "accepted"
  | "declined"
  | "cancelled"
  | "vetoed"
  | "executed"
  | "failed"
  | "expired";

export type TradeFailure = "not_dancing" | "not_held" | "no_room" | "cash_cap" | "left_league" | "no_scored_week" | "no_week_left";

export const TRADE_FAILURE_COPY: Record<TradeFailure, string> = {
  not_dancing: "A couple in it was no longer dancing.",
  not_held: "A couple in it was no longer on that roster.",
  no_room: "A manager had no roster spot for a couple coming in.",
  cash_cap: "A manager no longer had the points to send.",
  left_league: "A manager in it had left the league.",
  no_scored_week: "There was no week with results to move the points onto.",
  no_week_left: "The season ended before it could take effect.",
};

export function isTradeFailure(result: string | null): result is TradeFailure {
  return result != null && result in TRADE_FAILURE_COPY;
}

export const TRADE_MAX_LEGS = 12;

// Why an offer being built can't be sent yet, in the words propose_trade
// uses; the RPC stays the authority on rosters, room and the cash cap.
export function tradeDraftProblem(legs: TradeLeg[], teamId: string): string | null {
  if (!legs.some((leg) => leg.coupleId != null)) return "A trade has to move at least one couple";
  if (legs.length > TRADE_MAX_LEGS) return `A trade holds up to ${TRADE_MAX_LEGS} parts`;
  if (!legs.some((leg) => leg.fromManagerId === teamId || leg.toManagerId === teamId)) {
    return "You have to be part of a trade you propose";
  }
  const coupleIds = legs.flatMap((leg) => (leg.coupleId ? [leg.coupleId] : []));
  if (new Set(coupleIds).size < coupleIds.length) return "A couple can only move once in a trade";
  const pointRoutes = legs.flatMap((leg) => (leg.points != null ? [`${leg.fromManagerId}>${leg.toManagerId}`] : []));
  if (new Set(pointRoutes).size < pointRoutes.length) {
    return "Put the points one manager sends another into one amount";
  }
  return null;
}

export function tradePartyIds(legs: TradeLeg[]): string[] {
  return [...new Set(legs.flatMap((leg) => [leg.fromManagerId, leg.toManagerId]))];
}

// What each manager sends in a trade, senders in the order of their first
// part, then anyone who only receives.
export function tradeSides(legs: TradeLeg[]): { managerId: string; coupleIds: string[]; points: number }[] {
  const managerIds = [...new Set([...legs.map((leg) => leg.fromManagerId), ...legs.map((leg) => leg.toManagerId)])];
  return managerIds.map((managerId) => {
    const sent = legs.filter((leg) => leg.fromManagerId === managerId);
    return {
      managerId,
      coupleIds: sent.flatMap((leg) => (leg.coupleId ? [leg.coupleId] : [])),
      points: sent.reduce((sum, leg) => sum + (leg.points ?? 0), 0),
    };
  });
}

// The league vetoes a trade when more than half of the teams not in it vote
// to. A trade every team is part of has no one left to veto it.
export function vetoVotesNeeded(teamCount: number, partyCount: number): number | null {
  const outside = teamCount - partyCount;
  return outside > 0 ? Math.floor(outside / 2) + 1 : null;
}

// An offer lapses at its own 48-hour mark or the trade deadline, whichever
// comes first. The waiver run marks it expired; until then it is still stored
// as proposed.
export function offerExpiresAt(expiresAt: string, deadline: string | null): string {
  return deadline && new Date(deadline).getTime() < new Date(expiresAt).getTime() ? deadline : expiresAt;
}

// The scheduled job executes a cleared trade within a quarter hour of its
// window closing, so the week it lands in is read a tick later.
export const TRADE_TICK_MS = 15 * 60 * 1000;
export const VETO_WINDOW_MS = 24 * 60 * 60 * 1000;

export type TradeWeek = { weekNumber: number; nights: { airsAt: string | null; published: boolean }[] };

// The week a trade clearing at vetoEndsAt moves couples from: the first week
// whose first night hasn't aired when the job next runs (a tick after the
// window closes, or now for a window already closed; a removal's rule). A
// trade executes only once every night that has aired is published, so a
// window closing after a curtain and before Finish Week waits on that
// week's results, which `waitsFor` names.
export function tradeEffectiveWeek(
  weeks: TradeWeek[],
  vetoEndsAt: string | Date,
  now: Date = new Date()
): { week: number; waitsFor: number | null; aired: boolean } {
  const at = new Date(Math.max(new Date(vetoEndsAt).getTime() + TRADE_TICK_MS, now.getTime()));
  const airs = weeks.map((week) => ({ weekNumber: week.weekNumber, airsAt: week.nights.map((night) => night.airsAt) }));
  const week = releaseEffectiveWeek(airs, at);
  const pending = weeks
    .filter((w) => w.nights.some((night) => night.airsAt != null && new Date(night.airsAt).getTime() <= at.getTime() && !night.published))
    .map((w) => w.weekNumber);
  return { week, waitsFor: pending.length > 0 ? Math.max(...pending) : null, aired: week !== releaseEffectiveWeek(airs, now) };
}

export type TradeLogEntry = { status: TradeStatus; weekNumber: number | null };

// The league's record names couples who were still dancing when the trade
// was settled, so a viewer who is behind sees only what ran in weeks they
// have watched.
export function tradeLogVisible(trade: TradeLogEntry, cutoffWeek: number | null, behind: boolean): boolean {
  if (trade.status === "proposed" || trade.status === "accepted") return false;
  if (!behind) return true;
  return trade.weekNumber != null && cutoffWeek != null && trade.weekNumber <= cutoffWeek;
}

// League Settings and the Trades page explain trades in the same words.
export const TRADE_RULES = [
  "A trade moves couples between rosters and can include points. It has to move at least one couple, and it can be between more than two managers.",
  "Every manager in a trade has to accept it. Until they all have, only they can see it, and any of them can decline.",
  "Once everyone accepts, the trade is posted to the league for 24 hours. It is vetoed if more than half of the teams not in it vote to veto.",
  "A trade takes effect when its veto window closes, or once that week's results are posted if the show has aired by then. A traded couple starts scoring for their new manager in the next week that hasn't aired, and keeps scoring for their old one until then.",
  "Points move when the trade takes effect, onto the latest week with results. Across all their trades, a manager can send at most 10% of the points they have earned this season.",
  "A couple coming in takes the spot of a couple going out, the spot of a couple who has gone home, or an open spot. A trade goes through whole or not at all: if a couple in it goes home first, nothing moves.",
  "A couple in an open trade can't be in a waiver claim, and a couple in a waiver claim can't be offered in a trade.",
  "An offer expires if not everyone in it has accepted within 48 hours. Trades close at the Semi-Finals lock, and an offer still open then expires too.",
];
