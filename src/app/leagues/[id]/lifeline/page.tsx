import { LifelineCard, LifelineCatchUpCard } from "@/components/lifeline-card";
import { RosterMovesFrame, type RosterMovesFact } from "@/components/roster-moves-frame";
import { RosterMovesUnavailable } from "@/components/roster-moves-unavailable";
import { formatEpisodeCasual } from "@/lib/format-week";
import { loadLeaguePageBase } from "@/lib/league-page-data";
import { loadLifelineWeek } from "@/lib/lifeline-week-data";
import { loadRosterMoveTabs } from "@/lib/roster-moves-data";
import { rosterMovesBackLabel } from "@/lib/roster-moves-pages";
import { safeRelativePath } from "@/lib/safe-relative-path";
import { createClient } from "@/lib/supabase/server";

export default async function LifelinePage({
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
  const { league, upcomingEpisode, cutoff } = base;
  const [lifeline, { tabs }] = await Promise.all([loadLifelineWeek(supabase, base), loadRosterMoveTabs(supabase, base)]);

  const closeHref = safeRelativePath(from, `/leagues/${id}/picks`);
  const back = { href: closeHref, label: rosterMovesBackLabel(closeHref, id) };
  if (!lifeline) {
    const reason = !base.danceCardOn
      ? {
          title: "Dance Card Isn't On",
          body: "This league isn't running the draft and roster module. The commissioner can turn Dance Card on in League Settings.",
        }
      : !league.lifeline_enabled
        ? { title: "Lifeline Isn't On", body: "The commissioner can turn on Lifeline in League Settings." }
        : league.draft_status !== "completed"
          ? {
              title: "Lifeline Opens After the Draft",
              body: "There are no roster spots to stand in for until the draft is complete.",
            }
          : !upcomingEpisode
            ? { title: "Lifeline Is Done for the Season", body: "There are no weeks left to play a Lifeline in." }
            : {
                title: `Lifeline Starts in ${formatEpisodeCasual(league.lifeline_starts_week ?? upcomingEpisode.week_number)}`,
                body: "You can pick a couple for an open spot once that week's picks open.",
              };
    return <RosterMovesUnavailable back={back} {...reason} />;
  }

  const weekLabel = formatEpisodeCasual(lifeline.week.weekNumber);
  const facts: RosterMovesFact[] = [
    lifeline.locked
      ? { label: weekLabel, at: null, value: "Locked" }
      : { label: `${weekLabel} locks`, at: lifeline.lockAt, value: "Lock not set" },
    { label: "Pays", at: null, value: "Half their Dance Card" },
  ];

  return (
    <RosterMovesFrame leagueId={id} back={back} tabs={tabs} selected="lifeline" from={closeHref} facts={facts}>
      {cutoff.pendingRevealEpisode ? (
        <LifelineCatchUpCard pendingRevealWeek={cutoff.pendingRevealEpisode.week_number} />
      ) : (
        <LifelineCard
          key={`${lifeline.week.id}:${lifeline.locked}:${lifeline.slots.map((slot) => slot.pickCoupleId).join()}`}
          leagueId={id}
          week={lifeline.week}
          isLocked={lifeline.locked}
          slots={lifeline.slots}
          couples={lifeline.couples}
          coupleDisplayNames={Object.fromEntries(base.allDisplayNames)}
          leagueEntries={lifeline.leagueEntries}
          historyFrom={`/leagues/${id}/lifeline?from=${encodeURIComponent(closeHref)}`}
        />
      )}
    </RosterMovesFrame>
  );
}
