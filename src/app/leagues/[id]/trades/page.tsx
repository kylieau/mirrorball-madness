import { RosterMovesFrame, type RosterMovesFact } from "@/components/roster-moves-frame";
import { RosterMovesUnavailable } from "@/components/roster-moves-unavailable";
import { TradesPanel, type TradeView } from "@/components/trades-panel";
import { formatEpisodeCasual } from "@/lib/format-week";
import { loadLeaguePageBase } from "@/lib/league-page-data";
import { loadRosterMoveTabs } from "@/lib/roster-moves-data";
import { rosterMovesBackLabel } from "@/lib/roster-moves-pages";
import { safeRelativePath } from "@/lib/safe-relative-path";
import { createClient } from "@/lib/supabase/server";
import { offerExpiresAt, tradeEffectiveWeek, tradeLogVisible, VETO_WINDOW_MS, type TradeStatus, type TradeWeek } from "@/lib/trades";

export default async function TradesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const supabase = await createClient();
  const base = await loadLeaguePageBase(supabase, id);
  const { league, myTeamId, cutoff } = base;

  const closeHref = safeRelativePath(from, `/leagues/${id}/picks`);
  const back = { href: closeHref, label: rosterMovesBackLabel(closeHref, id) };
  const unavailable = !base.danceCardOn
    ? {
        title: "Dance Card Isn't On",
        body: "This league isn't running the draft and roster module. The commissioner can turn Dance Card on in League Settings.",
      }
    : !base.tradesOn
      ? { title: "Trades Aren't On", body: "The commissioner can turn on Trades in League Settings." }
      : league.draft_status !== "completed"
        ? { title: "Trades Open After the Draft", body: "There are no rosters to trade from until the draft is complete." }
        : null;

  if (unavailable) return <RosterMovesUnavailable back={back} {...unavailable} />;

  const [{ data: deadline }, { data: cashRoom }, { data: offers }, { tabs }] = await Promise.all([
    supabase.rpc("trade_deadline", { p_league_id: id }),
    supabase.rpc("trade_cash_available", { p_league_id: id }),
    // RLS returns the offers this team is part of plus every one the whole
    // trade accepted.
    supabase
      .from("trade_offers")
      .select(
        "id, proposed_by, status, result, created_at, expires_at, accepted_at, veto_ends_at, resolved_at, week_number, start_week, trade_parties(manager_id, accepted_at), trade_legs(leg_order, from_manager_id, to_manager_id, couple_id, points), trade_votes(manager_id)"
      )
      .eq("league_id", id),
    loadRosterMoveTabs(supabase, base),
  ]);

  const now = Date.now();
  const weeks: TradeWeek[] = base.groupedWeeks.map((week) => ({
    weekNumber: week.week_number,
    nights: week.episodes.map((episode) => ({ airsAt: episode.airs_at, published: episode.results_published_at != null })),
  }));
  // A trade accepted now clears a day from now; the last week it can land in
  // is the Finale.
  const startWeek = tradeEffectiveWeek(weeks, new Date(now + VETO_WINDOW_MS), new Date(now)).week;
  const lastWeek = base.finaleWeekNumber ?? Math.max(0, ...weeks.map((week) => week.weekNumber));
  const noWeekLeft = startWeek > lastWeek;
  const deadlinePassed = !deadline || new Date(deadline).getTime() <= now;
  const behind = cutoff.pendingRevealEpisode != null;
  const cutoffWeek = cutoff.effectiveLatestEpisode?.week_number ?? null;

  const trades: TradeView[] = [...(offers ?? [])]
    .sort((a, b) =>
      (b.resolved_at ?? b.accepted_at ?? b.created_at).localeCompare(a.resolved_at ?? a.accepted_at ?? a.created_at)
    )
    .map((offer) => {
      const expiresAt = offerExpiresAt(offer.expires_at, deadline ?? null);
      // A lapsed offer is only marked expired by the next waiver run; it
      // can't be accepted in the meantime.
      const lapsed = offer.status === "proposed" && (deadlinePassed || new Date(expiresAt).getTime() <= now);
      return {
        id: offer.id,
        proposedBy: offer.proposed_by,
        status: (lapsed ? "expired" : offer.status) as TradeStatus,
        result: offer.result,
        expiresAt,
        vetoEndsAt: offer.veto_ends_at,
        vetoOpen: offer.veto_ends_at != null && new Date(offer.veto_ends_at).getTime() > now,
        effect: offer.veto_ends_at ? tradeEffectiveWeek(weeks, offer.veto_ends_at, new Date(now)) : null,
        weekNumber: offer.week_number,
        startWeek: offer.start_week,
        legs: [...offer.trade_legs]
          .sort((a, b) => a.leg_order - b.leg_order)
          .map((leg) => ({
            fromManagerId: leg.from_manager_id,
            toManagerId: leg.to_manager_id,
            coupleId: leg.couple_id,
            points: leg.points == null ? null : Number(leg.points),
          })),
        parties: offer.trade_parties.map((party) => ({ managerId: party.manager_id, accepted: party.accepted_at != null })),
        vetoVotes: offer.trade_votes.map((vote) => vote.manager_id),
      };
    });

  const dancing = new Set(base.activeCouples.map((couple) => couple.id));
  const celebrityName = new Map(base.activeCouples.map((couple) => [couple.id, couple.celebrity_name]));
  const managerIds = [myTeamId, ...Object.keys(base.nameByManager).filter((managerId) => managerId !== myTeamId)];
  const rosters = managerIds.map((managerId) => ({
    managerId,
    coupleIds: base.rosterSlotPeriods
      .filter((slot) => slot.managerId === managerId && slot.endWeek == null && dancing.has(slot.coupleId))
      .map((slot) => slot.coupleId)
      .sort((a, b) => (celebrityName.get(a) ?? "").localeCompare(celebrityName.get(b) ?? "")),
  }));

  const closed = deadlinePassed || noWeekLeft;
  const facts: RosterMovesFact[] = [
    closed || !deadline ? { label: "Trades", at: null, value: "Closed" } : { label: "Trades close", at: deadline },
    { label: "Couples move", at: null, value: noWeekLeft ? "No week left" : formatEpisodeCasual(startWeek) },
  ];

  return (
    <RosterMovesFrame leagueId={id} back={back} tabs={tabs} selected="trades" from={closeHref} facts={facts}>
      <TradesPanel
        leagueId={id}
        historyFrom={`/leagues/${id}/trades?from=${encodeURIComponent(closeHref)}`}
        teamId={myTeamId}
        managerNames={base.nameByManager}
        coupleDisplayNames={Object.fromEntries(base.allDisplayNames)}
        behind={behind}
        pendingRevealWeek={cutoff.pendingRevealEpisode?.week_number ?? null}
        closed={closed}
        noWeekLeft={noWeekLeft}
        startWeek={startWeek}
        cashRoom={Number(cashRoom ?? 0)}
        rosters={behind ? [] : rosters}
        offers={behind ? [] : trades.filter((trade) => trade.status === "proposed")}
        waiting={behind ? [] : trades.filter((trade) => trade.status === "accepted")}
        log={trades.filter((trade) => tradeLogVisible(trade, cutoffWeek, behind))}
      />
    </RosterMovesFrame>
  );
}
