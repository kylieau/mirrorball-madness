import Link from "next/link";
import { XIcon } from "lucide-react";
import { LifelineCard, LifelineCatchUpCard } from "@/components/lifeline-card";
import { formatEpisodeCasual } from "@/lib/format-week";
import { loadLeaguePageBase } from "@/lib/league-page-data";
import { loadLifelineWeek } from "@/lib/lifeline-week-data";
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
  const lifeline = await loadLifelineWeek(supabase, base);

  const closeHref = safeRelativePath(from, `/leagues/${id}/picks`);
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
                body: "You can pick a couple for an empty roster spot once that week's picks open.",
              };
    return (
      <div className="flex flex-col items-center gap-4 px-4 py-24 text-center">
        <Link href={closeHref} aria-label="Close" className="self-start text-muted-foreground hover:text-foreground">
          <XIcon className="size-5" />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{reason.title}</h1>
        <p className="text-sm text-muted-foreground">{reason.body}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-12">
      <Link href={closeHref} aria-label="Close" className="self-start text-muted-foreground hover:text-foreground">
        <XIcon className="size-5" />
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lifeline</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A stand-in each week for a roster spot whose couple has gone home. You earn half the stand-in&apos;s Dance
          Card points.
        </p>
      </div>
      {cutoff.pendingRevealEpisode ? (
        <LifelineCatchUpCard pendingRevealWeek={cutoff.pendingRevealEpisode.week_number} />
      ) : (
        <LifelineCard
          key={`${lifeline.week.id}:${lifeline.locked}:${lifeline.slots.map((slot) => slot.pickCoupleId).join()}`}
          leagueId={id}
          week={lifeline.week}
          lockAt={lifeline.lockAt}
          isLocked={lifeline.locked}
          slots={lifeline.slots}
          couples={lifeline.couples}
          coupleDisplayNames={Object.fromEntries(base.allDisplayNames)}
          leagueEntries={lifeline.leagueEntries}
          historyFrom={`/leagues/${id}/lifeline?from=${encodeURIComponent(closeHref)}`}
        />
      )}
    </div>
  );
}
