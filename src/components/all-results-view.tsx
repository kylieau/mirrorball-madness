"use client";

import { Fragment, useState } from "react";
import { startEpisodeCorrection } from "@/app/admin/results/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { buildPeopleDisplayNames, type CoupleNameParts } from "@/lib/couple-display";
import { CoupleName } from "@/components/couple-name";
import {
  deriveResultsStatus,
  RESULTS_STATUS_BADGE_VARIANT,
  RESULTS_STATUS_BADGE_LABEL,
  type EpisodeResultsStatus,
} from "@/lib/results-status";
import type { DraftState } from "@/lib/results-draft";
import { formatEpisodeCasual, formatEpisodeCasualWithTheme, formatEpisodeLabel } from "@/lib/format-week";

type Couple = { id: string; celebrity_name: string; pro_name: string };
type Named = { id: string; name: string };
type DanceScore = {
  id: string;
  episode_id: string;
  couple_id: string;
  dance_style_id: string;
  total_score: number;
};
type JudgeScore = { dance_score_id: string; judge_id: string; score: number };
type EpisodeResult = {
  episode_id: string;
  couple_id: string;
  outcome: string;
  saved_by_judges: boolean;
  had_immunity: boolean;
  bonus_points: number;
  bonus_note: string | null;
};
type Episode = {
  id: string;
  episode_number: number;
  week_id: string | null;
  airs_at: string;
  theme: string | null;
  status: string;
  results_published_at: string | null;
  results_published_by: string | null;
};
type CompetitionWeek = {
  id: string;
  week_number: number;
  theme: string | null;
  is_finale: boolean;
  is_double_elimination_week: boolean;
};

type EpisodeWithStatus = Episode & { resultsStatus: EpisodeResultsStatus };

export function AllResultsView({
  view,
  canPropose,
  episodes,
  weeks,
  danceScores,
  judgeScores,
  episodeResults,
  couples,
  coupleDisplayNames,
  judges,
  danceStyles,
  draftsByEpisode,
  publishedByNames,
  onNavigateToEpisode,
  seasonNumber,
  roundTypes,
  roundTypesByEpisode,
  inJeopardyByEpisode,
}: {
  // Switcher lives one level up now (results-screen.tsx's PageHeader), as a
  // peer of Schedule rather than nested inside this component.
  view: "week" | "couple";
  // Starting a correction and continuing a draft are both propose-tier
  // writes, so a view-only visitor sees the results without those buttons.
  canPropose: boolean;
  episodes: Episode[];
  weeks: CompetitionWeek[];
  danceScores: DanceScore[];
  judgeScores: JudgeScore[];
  episodeResults: EpisodeResult[];
  couples: Couple[];
  coupleDisplayNames: Record<string, CoupleNameParts>;
  judges: Named[];
  danceStyles: Named[];
  draftsByEpisode: Record<string, DraftState>;
  publishedByNames: Record<string, string>;
  onNavigateToEpisode: (episodeId: string) => void;
  seasonNumber: number | null;
  roundTypes: Named[];
  roundTypesByEpisode: Record<string, string[]>;
  inJeopardyByEpisode: Record<string, string[]>;
}) {
  const inJeopardyKeys = new Set(
    Object.entries(inJeopardyByEpisode).flatMap(([episodeId, coupleIds]) =>
      coupleIds.map((coupleId) => `${episodeId}:${coupleId}`)
    )
  );
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const danceStyleById = new Map(danceStyles.map((d) => [d.id, d.name]));
  const judgeById = buildPeopleDisplayNames(judges);
  const couplesById = new Map(couples.map((c) => [c.id, c]));
  const weekById = new Map(weeks.map((week) => [week.id, week]));

  function coupleParts(coupleId: string): CoupleNameParts | null {
    if (coupleDisplayNames[coupleId]) return coupleDisplayNames[coupleId];
    const c = couplesById.get(coupleId);
    return c ? { celebrity: c.celebrity_name, pro: c.pro_name } : null;
  }

  const judgeScoresByDance = new Map<string, JudgeScore[]>();
  for (const js of judgeScores) {
    const list = judgeScoresByDance.get(js.dance_score_id) ?? [];
    list.push(js);
    judgeScoresByDance.set(js.dance_score_id, list);
  }

  const danceScoresByEpisodeCouple = new Map<string, DanceScore[]>();
  for (const ds of danceScores) {
    const key = `${ds.episode_id}:${ds.couple_id}`;
    const list = danceScoresByEpisodeCouple.get(key) ?? [];
    list.push(ds);
    danceScoresByEpisodeCouple.set(key, list);
  }

  function outcomeLabel(episodeId: string, coupleId: string, outcome: string) {
    if (outcome === "safe" && inJeopardyKeys.has(`${episodeId}:${coupleId}`)) return "In Jeopardy";
    return outcome === "bye" ? "DND" : outcome.replace("_", " ");
  }

  function episodeRoundTypeNames(episodeId: string): string[] {
    const assigned = new Set(roundTypesByEpisode[episodeId] ?? []);
    return roundTypes.filter((rt) => assigned.has(rt.name)).map((rt) => rt.name);
  }

  function noteLabel(r: EpisodeResult) {
    const notes: string[] = [];
    if (r.saved_by_judges) notes.push("judges' save");
    if (r.had_immunity) notes.push("immunity");
    if (r.bonus_points) {
      notes.push(`+${r.bonus_points} bonus${r.bonus_note ? ` (${r.bonus_note})` : ""}`);
    }
    return notes.join(", ");
  }

  function DanceBreakdownRow({
    dance,
    colSpan,
    isLast,
  }: {
    dance: DanceScore;
    colSpan: number;
    isLast: boolean;
  }) {
    const scores = judgeScoresByDance.get(dance.id) ?? [];
    return (
      <tr className={isLast ? "border-b border-border last:border-b-0" : undefined}>
        <td colSpan={colSpan} className="px-2 pb-1.5 pl-6">
          <div className="text-xs text-muted-foreground">
            {danceStyleById.get(dance.dance_style_id) ?? "Unknown dance"}: {dance.total_score}
            {scores.length > 0 && (
              <>
                {" "}
                ({scores.map((s) => `${judgeById.get(s.judge_id) ?? "?"}: ${s.score}`).join(", ")})
              </>
            )}
          </div>
        </td>
      </tr>
    );
  }

  const relevantEpisodes: EpisodeWithStatus[] = episodes
    .map((e) => ({
      ...e,
      resultsStatus: deriveResultsStatus(
        { results_published_at: e.results_published_at },
        !!draftsByEpisode[e.id]?.hasDraft
      ),
    }))
    .filter((e) => e.resultsStatus !== "not_started");

  const weekGroups = [...weeks]
    .sort((a, b) => b.week_number - a.week_number)
    .map((week) => ({
      week,
      episodes: relevantEpisodes
        .filter((e) => e.week_id === week.id)
        .sort((a, b) => a.episode_number - b.episode_number),
    }))
    .filter((group) => group.episodes.length > 0);

  const exhibitionEpisodes = relevantEpisodes
    .filter((e) => e.week_id == null)
    .sort((a, b) => b.episode_number - a.episode_number);

  const mostRecentPublishedWeekNumber = Math.max(
    0,
    ...episodes
      .filter((e) => e.results_published_at)
      .map((e) => (e.week_id ? (weekById.get(e.week_id)?.week_number ?? 0) : 0))
  );

  async function handleCorrect(episodeId: string) {
    setError(null);
    setCorrectingId(episodeId);
    const result = await startEpisodeCorrection(episodeId);
    if (result.error) {
      setError(result.error);
      setCorrectingId(null);
      return;
    }
    onNavigateToEpisode(episodeId);
    setCorrectingId(null);
  }

  function episodeResultsRows(ep: EpisodeWithStatus) {
    return episodeResults
      .filter((r) => r.episode_id === ep.id)
      .map((r) => ({
        ...r,
        parts: coupleParts(r.couple_id),
        dances: danceScoresByEpisodeCouple.get(`${ep.id}:${r.couple_id}`) ?? [],
        total: (danceScoresByEpisodeCouple.get(`${ep.id}:${r.couple_id}`) ?? []).reduce(
          (sum, d) => sum + d.total_score,
          0
        ),
      }))
      .sort((a, b) => b.total - a.total);
  }

  function EpisodeResultsBlock({
    ep,
    weekNumber,
    showTvLabel,
  }: {
    ep: EpisodeWithStatus;
    weekNumber: number | null;
    showTvLabel: boolean;
  }) {
    const results = episodeResultsRows(ep);
    const roundTypeNames = episodeRoundTypeNames(ep.id);
    const coupleCount = results.length > 0 ? results.length : (draftsByEpisode[ep.id]?.entries.length ?? 0);
    const publishedByName = ep.results_published_by ? publishedByNames[ep.results_published_by] : null;
    const isCorrectingOlderWeek =
      ep.resultsStatus === "published" && weekNumber != null && weekNumber !== mostRecentPublishedWeekNumber;

    return (
      <div className="flex flex-col gap-3">
        {showTvLabel && (
          <p className="text-xs font-medium text-muted-foreground">
            {formatEpisodeLabel(ep.episode_number, seasonNumber)}
            {ep.theme ? ` — ${ep.theme}` : ""}
          </p>
        )}
        {roundTypeNames.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {roundTypeNames.map((name) => (
              <Badge key={name} variant="secondary">
                {name}
              </Badge>
            ))}
          </div>
        )}
        {ep.resultsStatus === "published" ? (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="p-2 font-medium">Couple</th>
                    <th className="p-2 font-medium">Pts</th>
                    <th className="p-2 font-medium">Outcome</th>
                    <th className="p-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <Fragment key={r.couple_id}>
                      <tr
                        className={
                          r.dances.length === 0 ? "border-b border-border last:border-b-0" : undefined
                        }
                      >
                        <td className="whitespace-nowrap p-2">
                          {r.parts ? <CoupleName {...r.parts} /> : "Unknown"}
                        </td>
                        <td className="p-2">{r.outcome === "bye" ? "—" : r.total}</td>
                        <td className="whitespace-nowrap p-2 capitalize">{outcomeLabel(r.episode_id, r.couple_id, r.outcome)}</td>
                        <td className="p-2 text-muted-foreground">{noteLabel(r) || "—"}</td>
                      </tr>
                      {r.dances.map((d, i) => (
                        <DanceBreakdownRow
                          key={d.id}
                          dance={d}
                          colSpan={4}
                          isLast={i === r.dances.length - 1}
                        />
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            {ep.results_published_at && (
              <p className="text-xs text-muted-foreground">
                {coupleCount} couple{coupleCount === 1 ? "" : "s"} scored · published{" "}
                {new Date(ep.results_published_at).toLocaleDateString()},{" "}
                {new Date(ep.results_published_at).toLocaleTimeString()}
                {publishedByName ? ` by ${publishedByName}` : ""}
              </p>
            )}

            {canPropose && (
            <Dialog>
              <DialogTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className="self-start"
                    disabled={correctingId === ep.id}
                  />
                }
              >
                {correctingId === ep.id ? "Starting..." : "Correct Results"}
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    Correct{" "}
                    {weekNumber != null
                      ? formatEpisodeCasual(weekNumber)
                      : formatEpisodeLabel(ep.episode_number, seasonNumber)}
                    ?
                  </DialogTitle>
                  <DialogDescription>
                    This discards any unsaved draft edits for this episode and starts a fresh
                    correction from what&apos;s currently published. Nothing changes for players
                    until you publish again.
                    {isCorrectingOlderWeek && (
                      <span className="mt-2 block text-amber-700 dark:text-amber-400">
                        {formatEpisodeCasual(mostRecentPublishedWeekNumber)} has already been
                        published after this week — correcting an elimination here won&apos;t
                        recompute that later week automatically. Double-check it still makes sense
                        afterward.
                      </span>
                    )}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                  <Button onClick={() => handleCorrect(ep.id)}>Start Correction</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Unpublished draft — {coupleCount} couple
              {coupleCount === 1 ? "" : "s"} entered so far.
            </p>
            {canPropose && (
              <Button
                size="sm"
                variant="outline"
                className="self-start"
                onClick={() => onNavigateToEpisode(ep.id)}
              >
                Continue in Enter Results
              </Button>
            )}
          </>
        )}
      </div>
    );
  }

  function groupStatus(groupEpisodes: EpisodeWithStatus[]): EpisodeResultsStatus {
    if (groupEpisodes.some((e) => e.resultsStatus === "draft_correcting")) return "draft_correcting";
    if (groupEpisodes.some((e) => e.resultsStatus === "draft")) return "draft";
    if (groupEpisodes.every((e) => e.resultsStatus === "published")) return "published";
    return groupEpisodes[0]?.resultsStatus ?? "draft";
  }

  const coupleIdsWithResults = new Set(episodeResults.map((r) => r.couple_id));
  const couplesWithHistory = couples
    .filter((c) => coupleIdsWithResults.has(c.id))
    .sort((a, b) => a.celebrity_name.localeCompare(b.celebrity_name));

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {view === "week" ? (
        weekGroups.length === 0 && exhibitionEpisodes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No results entered yet.</p>
        ) : (
          <Accordion>
            {weekGroups.map(({ week, episodes: weekEpisodes }) => {
              const status = groupStatus(weekEpisodes);
              const coupleCount = weekEpisodes.reduce((sum, ep) => {
                const published = episodeResults.filter((r) => r.episode_id === ep.id).length;
                return sum + (published > 0 ? published : (draftsByEpisode[ep.id]?.entries.length ?? 0));
              }, 0);
              return (
                <AccordionItem key={week.id} value={week.id}>
                  <AccordionTrigger>
                    <div className="flex w-full items-center justify-between gap-3 pr-2">
                      <div>
                        <p className="font-medium">
                          {formatEpisodeCasualWithTheme(week.week_number, week.theme)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {coupleCount} couple{coupleCount === 1 ? "" : "s"} scored
                          {weekEpisodes.length > 1 &&
                            ` · ${weekEpisodes.length} nights`}
                        </p>
                      </div>
                      <Badge variant={RESULTS_STATUS_BADGE_VARIANT[status]}>
                        {RESULTS_STATUS_BADGE_LABEL[status]}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="flex flex-col gap-6">
                      {weekEpisodes.map((ep) => (
                        <EpisodeResultsBlock
                          key={ep.id}
                          ep={ep}
                          weekNumber={week.week_number}
                          showTvLabel={weekEpisodes.length > 1}
                        />
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
            {exhibitionEpisodes.map((ep) => (
              <AccordionItem key={ep.id} value={ep.id}>
                <AccordionTrigger>
                  <div className="flex w-full items-center justify-between gap-3 pr-2">
                    <div>
                      <p className="font-medium">
                        {formatEpisodeLabel(ep.episode_number, seasonNumber)}
                        {ep.theme ? ` — ${ep.theme}` : " — Exhibition"}
                      </p>
                    </div>
                    <Badge variant={RESULTS_STATUS_BADGE_VARIANT[ep.resultsStatus]}>
                      {RESULTS_STATUS_BADGE_LABEL[ep.resultsStatus]}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <EpisodeResultsBlock ep={ep} weekNumber={null} showTvLabel={false} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )
      ) : couplesWithHistory.length === 0 ? (
        <p className="text-sm text-muted-foreground">No results entered yet.</p>
      ) : (
        couplesWithHistory.map((c) => {
          const history = episodeResults
            .filter((r) => r.couple_id === c.id)
            .map((r) => {
              const dances = danceScoresByEpisodeCouple.get(`${r.episode_id}:${c.id}`) ?? [];
              const episode = episodes.find((e) => e.id === r.episode_id);
              const week = episode?.week_id ? weekById.get(episode.week_id) : undefined;
              return {
                ...r,
                episode,
                week,
                dances,
                total: dances.reduce((sum, d) => sum + d.total_score, 0),
              };
            })
            .sort((a, b) => {
              const weekA = a.week?.week_number ?? 9999;
              const weekB = b.week?.week_number ?? 9999;
              if (weekA !== weekB) return weekA - weekB;
              return (a.episode?.episode_number ?? 0) - (b.episode?.episode_number ?? 0);
            });

          return (
            <Card key={c.id}>
              <CardHeader>
                <CardTitle>
                  <CoupleName {...(coupleDisplayNames[c.id] ?? { celebrity: c.celebrity_name, pro: c.pro_name })} />
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="p-2 font-medium">Week</th>
                      <th className="p-2 font-medium">Pts</th>
                      <th className="p-2 font-medium">Outcome</th>
                      <th className="p-2 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h, i) => {
                      const multiNight =
                        h.week != null && episodes.filter((e) => e.week_id === h.week!.id).length > 1;
                      const weekLabel = h.week
                        ? multiNight
                          ? `${formatEpisodeCasual(h.week.week_number)} · ${h.episode?.theme?.trim() || formatEpisodeLabel(h.episode?.episode_number ?? 0, seasonNumber)}`
                          : formatEpisodeCasualWithTheme(h.week.week_number, h.week.theme ?? h.episode?.theme)
                        : h.episode
                          ? `${formatEpisodeLabel(h.episode.episode_number, seasonNumber)} (exhibition)`
                          : "Episode ?";
                      return (
                        <Fragment key={i}>
                          <tr className={h.dances.length === 0 ? "border-b border-border last:border-b-0" : undefined}>
                            <td className="whitespace-nowrap p-2">{weekLabel}</td>
                            <td className="p-2">{h.outcome === "bye" ? "—" : h.total}</td>
                            <td className="whitespace-nowrap p-2 capitalize">{outcomeLabel(h.episode_id, h.couple_id, h.outcome)}</td>
                            <td className="p-2 text-muted-foreground">{noteLabel(h) || "—"}</td>
                          </tr>
                          {h.dances.map((d, j) => (
                            <DanceBreakdownRow key={d.id} dance={d} colSpan={4} isLast={j === h.dances.length - 1} />
                          ))}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
