import { RecastPanel, type RecastSpot } from "@/components/recast-panel";
import { RosterMovesFrame, type RosterMovesFact } from "@/components/roster-moves-frame";
import { RosterMovesUnavailable } from "@/components/roster-moves-unavailable";
import { formatEpisodeCasual } from "@/lib/format-week";
import { loadLeaguePageBase } from "@/lib/league-page-data";
import { isRecastMiss, recastDraftRank, recastOrder, recastWire } from "@/lib/recast";
import { classifyRosterOccupancy } from "@/lib/recast-framing";
import { loadRosterMoveTabs } from "@/lib/roster-moves-data";
import { rosterMovesBackLabel } from "@/lib/roster-moves-pages";
import { safeRelativePath } from "@/lib/safe-relative-path";
import { createClient } from "@/lib/supabase/server";

export default async function WaiversPage({
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
  const { league, members, myTeamId, cutoff, finaleWeekNumber } = base;

  const closeHref = safeRelativePath(from, `/leagues/${id}/picks`);
  const back = { href: closeHref, label: rosterMovesBackLabel(closeHref, id) };
  const unavailable = !base.danceCardOn
    ? {
        title: "Dance Card Isn't On",
        body: "This league isn't running the draft and roster module. The commissioner can turn Dance Card on in League Settings.",
      }
    : !base.waiversOn
      ? {
          title: "Recast Isn't On",
          body: "This league's rosters are locked. The commissioner can turn on Recast, Mirrorball's waiver wire, in League Settings.",
        }
      : league.draft_status !== "completed"
        ? { title: "Recast Opens After the Draft", body: "There are no rosters to change until the draft is complete." }
        : null;

  if (unavailable) return <RosterMovesUnavailable back={back} {...unavailable} />;

  const [{ data: cycleRows }, { data: pendingDrops }, { data: claims }, { data: cycles }, { tabs }, { data: releaseRows }] = await Promise.all([
    supabase.rpc("recast_next_cycle", { p_league_id: id }),
    supabase.rpc("recast_pending_drops", { p_league_id: id }),
    // RLS returns this team's own claims plus every awarded one.
    supabase
      .from("waiver_claims")
      .select("id, manager_id, couple_id, drop_couple_id, slot_number, status, result, priority_order, week_number, start_week")
      .eq("league_id", id),
    supabase.from("recast_cycles").select("week_number").eq("league_id", id),
    loadRosterMoveTabs(supabase, base),
    supabase.from("roster_releases").select("id, manager_name, couple_id, week_number").eq("league_id", id),
  ]);

  const cycle = cycleRows?.[0];
  // due_at is null until the run's week has its results posted.
  const nextRun =
    cycle && cycle.start_week != null
      ? { weekNumber: cycle.week_number, dueAt: cycle.due_at as string | null, startWeek: cycle.start_week }
      : null;
  const lastRunWeek = Math.max(0, ...(cycles ?? []).map((row) => row.week_number));
  const cutoffWeek = cutoff.effectiveLatestEpisode?.week_number ?? null;

  const coupleById = new Map(base.flatCouples.map((couple) => [couple.id, couple]));
  const currentSlots = base.rosterSlotPeriods.filter((slot) => slot.endWeek == null);
  const ownSlots = currentSlots.filter((slot) => slot.managerId === myTeamId);
  // A spot whose couple went home in a week the viewer hasn't watched is
  // neither offered as open nor as a drop. A spot a trade emptied has no
  // couple at all.
  const spots = Array.from({ length: league.roster_size }, (_, index) => index + 1).flatMap((slotNumber): RecastSpot[] => {
    const slot = ownSlots.find((own) => own.slotNumber === slotNumber);
    if (!slot) return [{ slotNumber, coupleId: null, open: true }];
    const couple = coupleById.get(slot.coupleId);
    if (!couple) return [];
    const occupancy = classifyRosterOccupancy(
      { status: couple.status, eliminationWeek: couple.elimination_week },
      cutoffWeek,
      finaleWeekNumber
    );
    return occupancy === "hidden-open"
      ? []
      : [{ slotNumber, coupleId: slot.coupleId, open: occupancy === "revealed-open" }];
  });

  const ownClaims = (claims ?? []).filter((claim) => claim.manager_id === myTeamId);
  const wire = recastWire({
    dancingCoupleIds: [...base.activeCouples]
      .sort((a, b) => a.celebrity_name.localeCompare(b.celebrity_name))
      .map((couple) => couple.id),
    heldCoupleIds: new Set(currentSlots.map((slot) => slot.coupleId)),
    pendingDrops: (pendingDrops ?? []).map((drop) => ({ coupleId: drop.couple_id, managerId: drop.manager_id })),
    teamId: myTeamId,
    dropLockedCoupleIds: new Set(
      ownClaims.flatMap((claim) =>
        claim.status === "approved" && claim.drop_couple_id && claim.week_number === lastRunWeek
          ? [claim.drop_couple_id]
          : []
      )
    ),
  });

  const weekNumberById = new Map(base.completedEpisodes.map((week) => [week.id, week.week_number]));
  const danceCardWeight = base.scoringSettings?.judges_score_category_weight ?? 1;
  const order = recastOrder(
    (members ?? []).map((member) => ({ managerId: member.user_id, draftRank: recastDraftRank(league, member) })),
    base.scoreRows.flatMap((row) => {
      const weekNumber = weekNumberById.get(row.week_id);
      return weekNumber != null && cutoff.allowedEpisodeIds.has(row.week_id)
        ? [
            {
              managerId: row.manager_id,
              weekNumber,
              danceCardPoints: row.roster_points * danceCardWeight + (row.lifeline_points ?? 0) + (row.transfer_points ?? 0),
            },
          ]
        : [];
    })
  );

  const facts: RosterMovesFact[] = nextRun
    ? [
        nextRun.dueAt
          ? { label: "Next run", at: nextRun.dueAt }
          : { label: "Next run", at: null, value: `48h after ${formatEpisodeCasual(nextRun.weekNumber)} results` },
        { label: "Claims start", at: null, value: formatEpisodeCasual(nextRun.startWeek) },
      ]
    : [{ label: "Waiver runs", at: null, value: "Done for the season" }];

  return (
    <RosterMovesFrame leagueId={id} back={back} tabs={tabs} selected="recast" from={closeHref} facts={facts}>
      <RecastPanel
        leagueId={id}
        historyFrom={`/leagues/${id}/waivers?from=${encodeURIComponent(closeHref)}`}
        nextRun={nextRun}
        pendingRevealWeek={cutoff.pendingRevealEpisode?.week_number ?? null}
        behind={cutoff.pendingRevealEpisode != null}
        list={ownClaims
          .filter((claim) => claim.status === "pending")
          .sort((a, b) => (a.priority_order ?? 0) - (b.priority_order ?? 0))
          .map((claim) => ({ coupleId: claim.couple_id, slotNumber: claim.slot_number, dropCoupleId: claim.drop_couple_id }))}
        spots={spots}
        wire={wire}
        order={order}
        orderThroughWeek={cutoffWeek}
        teamId={myTeamId}
        managerNames={base.nameByManager}
        coupleDisplayNames={Object.fromEntries(base.allDisplayNames)}
        misses={ownClaims
          .filter((claim) => claim.status === "rejected" && claim.week_number === lastRunWeek)
          .sort((a, b) => (a.priority_order ?? 0) - (b.priority_order ?? 0))
          .flatMap((claim) => (isRecastMiss(claim.result) ? [{ coupleId: claim.couple_id, result: claim.result }] : []))}
        log={(claims ?? [])
          .filter((claim) => claim.status === "approved" && cutoffWeek != null && claim.week_number <= cutoffWeek)
          .sort(
            (a, b) =>
              b.week_number - a.week_number ||
              (base.nameByManager[a.manager_id] ?? "").localeCompare(base.nameByManager[b.manager_id] ?? "")
          )
          .map((claim) => ({
            id: claim.id,
            managerId: claim.manager_id,
            coupleId: claim.couple_id,
            dropCoupleId: claim.drop_couple_id,
            weekNumber: claim.week_number,
            startWeek: claim.start_week,
          }))}
        releases={(releaseRows ?? [])
          .filter((release) => cutoffWeek != null && release.week_number - 1 <= cutoffWeek)
          .map((release) => ({ id: release.id, managerName: release.manager_name, coupleId: release.couple_id, weekNumber: release.week_number }))}
      />
    </RosterMovesFrame>
  );
}
