import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { CoupleName } from "@/components/couple-name";
import { MarkWeekWatchedButton } from "@/components/mark-week-watched-button";
import { cn } from "cn";
import type { CoupleNameParts } from "@/lib/couple-display";
import { formatEpisodeCasual } from "@/lib/format-week";
import { mergeCoupleOutcomes } from "@/lib/competition-week";

type Couple = { id: string; celebrity_name: string; pro_name: string };
type Named = { id: string; name: string };
type DanceScore = {
  id: string;
  episode_id: string;
  couple_id: string;
  dance_style_id: string;
  song_title: string | null;
  total_score: number;
};
type EpisodeResult = {
  episode_id: string;
  couple_id: string;
  outcome: string;
};
type Episode = {
  id: string;
  week_number: number;
  airs_at: string;
  theme: string | null;
  is_finale: boolean;
};
type ManagerWeekScore = { managerId: string; totalPoints: number };

function outcomeTag(r: EpisodeResult): { label: string; className: string } {
  if (r.outcome === "eliminated") return { label: "Eliminated", className: "bg-muted text-muted-foreground" };
  if (r.outcome === "withdrawn") return { label: "Withdrew", className: "bg-muted text-muted-foreground" };
  if (r.outcome === "winner") return { label: "Winner", className: "bg-primary/15 text-accent" };
  if (r.outcome === "runner_up") return { label: "Runner-up", className: "bg-primary/15 text-accent" };
  if (r.outcome === "third_place") return { label: "Third Place", className: "bg-primary/15 text-accent" };
  if (r.outcome === "bye") return { label: "DND", className: "bg-muted text-muted-foreground" };
  return { label: "Safe", className: "bg-emerald/20 text-emerald-text" };
}

export function WeeklyResultsView({
  episodes,
  episodeResults,
  danceScores,
  danceStyles,
  couples,
  coupleDisplayNames,
  nameByManager,
  scoresByEpisode,
  currentUserId,
  leaguesByCouple,
  pendingReveal,
}: {
  episodes: Episode[];
  episodeResults: EpisodeResult[];
  danceScores: DanceScore[];
  danceStyles: Named[];
  couples: Couple[];
  coupleDisplayNames: Record<string, CoupleNameParts>;
  // Manager-scoped props are only meaningful within a single league — omit
  // all three to render the cross-league "This Week" view (no Points by
  // team section) instead. leaguesByCouple is the cross-league view's own
  // addition: which of the viewer's leagues have this couple on their
  // roster, so eliminations/safe calls read as personally relevant.
  nameByManager?: Record<string, string>;
  scoresByEpisode?: Record<string, ManagerWeekScore[]>;
  currentUserId?: string;
  leaguesByCouple?: Record<string, string[]>;
  // Set when a completed episode sits past last_watched_week. Shown as the
  // empty-state teaser when nothing is visible yet, or as a catch-up card
  // above older results so the viewer isn't stranded without a mark control.
  pendingReveal?: { weekNumber: number; theme: string | null } | null;
}) {
  const episode = episodes[0];
  const pendingCard = pendingReveal ? (
    <Card>
      <CardHeader>
        <CardTitle>
          {formatEpisodeCasual(pendingReveal.weekNumber)}&apos;s results are ready
        </CardTitle>
        <CardDescription>
          {pendingReveal.theme ? `${pendingReveal.theme}. ` : ""}Mark it as watched once you&apos;ve caught up
          to see dances, scores, and who went home.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <MarkWeekWatchedButton weekNumber={pendingReveal.weekNumber} />
      </CardContent>
    </Card>
  ) : null;

  if (!episode) {
    if (pendingReveal) {
      return (
        <div>
          <p className="mb-4 text-sm text-muted-foreground">Spoiler-Free Mode is on</p>
          {pendingCard}
        </div>
      );
    }
    return (
      <div>
        <p className="mb-4 text-sm text-muted-foreground">Season hasn&apos;t started yet</p>
        <Card>
          <CardHeader>
            <CardTitle>Nothing to show yet</CardTitle>
            <CardDescription>
              Dances, scores and points by team fill in here once the season premieres.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const danceStyleById = new Map(danceStyles.map((d) => [d.id, d.name]));
  const couplesById = new Map(couples.map((c) => [c.id, c]));

  function coupleParts(coupleId: string): CoupleNameParts | null {
    if (coupleDisplayNames[coupleId]) return coupleDisplayNames[coupleId];
    const c = couplesById.get(coupleId);
    return c ? { celebrity: c.celebrity_name, pro: c.pro_name } : null;
  }

  const episodeIds = new Set(episodes.map((e) => e.id));
  const danceScoresByCouple = new Map<string, DanceScore[]>();
  for (const ds of danceScores) {
    if (!episodeIds.has(ds.episode_id)) continue;
    const list = danceScoresByCouple.get(ds.couple_id) ?? [];
    list.push(ds);
    danceScoresByCouple.set(ds.couple_id, list);
  }

  const outcomes = mergeCoupleOutcomes(episodeResults.filter((r) => episodeIds.has(r.episode_id)))
    .map((r) => {
      const dances = danceScoresByCouple.get(r.couple_id) ?? [];
      return {
        ...r,
        parts: coupleParts(r.couple_id),
        danceLabels: dances.map((d) => {
          const style = danceStyleById.get(d.dance_style_id) ?? "Unknown dance";
          const song = d.song_title?.trim();
          return song ? `${style} · ${song}` : style;
        }),
        total: dances.reduce((sum, d) => sum + d.total_score, 0),
      };
    })
    .sort((a, b) => b.total - a.total);

  const eliminated = outcomes.filter((r) => r.outcome === "eliminated");
  const managerScores = [...(scoresByEpisode?.[episode.id] ?? [])].sort((a, b) => b.totalPoints - a.totalPoints);

  return (
    <div>
      {pendingCard && <div className="mb-4">{pendingCard}</div>}

      {eliminated.length > 0 && (
        <div className="mb-4 rounded-2xl border border-primary/40 bg-linear-to-br from-curtain to-curtain-light px-5 py-4 text-center">
          <p className="text-xs text-accent">Eliminated</p>
          <div className="mt-1 font-heading text-lg font-semibold">
            {eliminated.map((r) => (
              <p key={r.couple_id}>{r.parts ? `${r.parts.celebrity} & ${r.parts.pro}` : "Unknown"}</p>
            ))}
          </div>
        </div>
      )}

      <div className="mb-2 flex items-center justify-between text-sm font-semibold text-accent">
        <span>Leaderboard</span>
        <span className="font-normal text-muted-foreground">Judges&apos; score</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {outcomes.map((r) => {
          const tag = outcomeTag(r);
          return (
            <div
              key={r.couple_id}
              className={cn(
                "flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-3.5 py-3",
                r.outcome === "eliminated" && "opacity-60"
              )}
            >
              <div>
                <p className="text-sm font-semibold">{r.parts ? <CoupleName {...r.parts} /> : "Unknown"}</p>
                {r.danceLabels.map((label, i) => (
                  <p key={i} className="mt-0.5 text-xs text-muted-foreground">
                    {label}
                  </p>
                ))}
                {leaguesByCouple?.[r.couple_id]?.map((line) => (
                  <p key={line} className="mt-0.5 text-xs text-accent">
                    {line}
                  </p>
                ))}
              </div>
              <div className="shrink-0 text-right text-xs text-muted-foreground">
                <span className={cn("mb-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold", tag.className)}>
                  {tag.label}
                </span>
                <span className="block font-heading text-base font-semibold text-foreground">
                  {r.outcome === "bye" ? "—" : r.total}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {managerScores.length > 0 && nameByManager && (
        <>
          <div className="mb-2 mt-6 flex items-center justify-between border-t border-border pt-4 text-sm font-semibold text-accent">
            <span>Points by Team</span>
            <span className="font-normal text-muted-foreground">{managerScores.length} managers</span>
          </div>
          <div className="flex flex-col">
            {managerScores.map((s, i) => {
              const isYou = s.managerId === currentUserId;
              return (
                <div
                  key={s.managerId}
                  className="flex items-center gap-3 border-t border-border py-2 text-sm first:border-t-0"
                >
                  <span className="w-5 font-heading font-semibold text-accent">{i + 1}</span>
                  <span className={cn("flex-1", isYou && "font-semibold text-accent")}>
                    {nameByManager[s.managerId] ?? "Unknown"}
                    {isYou && " (you)"}
                  </span>
                  <span>{s.totalPoints >= 0 ? "+" : ""}{s.totalPoints}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
