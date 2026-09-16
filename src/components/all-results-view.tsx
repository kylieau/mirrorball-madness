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
} from "@/lib/results-status";
import type { DraftState } from "@/lib/results-draft";
import { formatEpisodeLabel } from "@/lib/format-week";

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
  was_team_dance: boolean;
  had_immunity: boolean;
  bonus_points: number;
  bonus_note: string | null;
};
type Episode = {
  id: string;
  week_number: number;
  airs_at: string;
  theme: string | null;
  status: string;
  is_finale: boolean;
  results_published_at: string | null;
  results_published_by: string | null;
};

export function AllResultsView({
  episodes,
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
}: {
  episodes: Episode[];
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
}) {
  const [view, setView] = useState<"week" | "couple">("week");
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const danceStyleById = new Map(danceStyles.map((d) => [d.id, d.name]));
  const judgeById = buildPeopleDisplayNames(judges);
  const couplesById = new Map(couples.map((c) => [c.id, c]));

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

  function noteLabel(r: EpisodeResult) {
    const notes: string[] = [];
    if (r.saved_by_judges) notes.push("judges' save");
    if (r.was_team_dance) notes.push("team dance");
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
    const values = scores.map((s) => s.score);
    const spread = values.length > 1 ? Math.max(...values) - Math.min(...values) : 0;
    return (
      <tr className={isLast ? "border-b border-border last:border-b-0" : undefined}>
        <td colSpan={colSpan} className="px-2 pb-1.5 pl-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs text-muted-foreground">
            <span>
              {danceStyleById.get(dance.dance_style_id) ?? "Unknown dance"}: {dance.total_score}
              {scores.length > 0 && (
                <>
                  {" "}
                  ({scores.map((s) => `${judgeById.get(s.judge_id) ?? "?"}: ${s.score}`).join(", ")})
                </>
              )}
            </span>
            {spread > 0 && <span>spread: {spread}</span>}
          </div>
        </td>
      </tr>
    );
  }

  const relevantEpisodes = episodes
    .map((e) => ({
      ...e,
      resultsStatus: deriveResultsStatus(
        { results_published_at: e.results_published_at },
        !!draftsByEpisode[e.id]?.hasDraft
      ),
    }))
    .filter((e) => e.resultsStatus !== "not_started")
    .sort((a, b) => b.week_number - a.week_number);

  const mostRecentPublishedEpisode = episodes
    .filter((e) => e.results_published_at)
    .sort((a, b) => b.week_number - a.week_number)[0];
  const mostRecentPublishedWeekNumber = mostRecentPublishedEpisode?.week_number ?? 0;

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

  const coupleIdsWithResults = new Set(episodeResults.map((r) => r.couple_id));
  const couplesWithHistory = couples
    .filter((c) => coupleIdsWithResults.has(c.id))
    .sort((a, b) => a.celebrity_name.localeCompare(b.celebrity_name));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2">
        <Button size="sm" variant={view === "week" ? "default" : "outline"} onClick={() => setView("week")}>
          By week
        </Button>
        <Button size="sm" variant={view === "couple" ? "default" : "outline"} onClick={() => setView("couple")}>
          By couple
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {view === "week" ? (
        relevantEpisodes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No results entered yet.</p>
        ) : (
          <Accordion>
            {relevantEpisodes.map((ep) => {
              const results = episodeResults
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

              const coupleCount = results.length > 0 ? results.length : draftsByEpisode[ep.id]?.entries.length ?? 0;
              const publishedByName = ep.results_published_by ? publishedByNames[ep.results_published_by] : null;
              const isCorrectingOlderWeek =
                ep.resultsStatus === "published" && ep.week_number !== mostRecentPublishedWeekNumber;

              return (
                <AccordionItem key={ep.id} value={ep.id}>
                  <AccordionTrigger>
                    <div className="flex w-full items-center justify-between gap-3 pr-2">
                      <div>
                        <p className="font-medium">
                          {formatEpisodeLabel(ep.week_number)}
                          {ep.theme ? ` — ${ep.theme}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {coupleCount} couple{coupleCount === 1 ? "" : "s"} scored
                          {ep.resultsStatus === "published" && ep.results_published_at && (
                            <>
                              {" · published "}
                              {new Date(ep.results_published_at).toLocaleDateString()}
                              {", "}
                              {new Date(ep.results_published_at).toLocaleTimeString()}
                              {publishedByName ? ` by ${publishedByName}` : ""}
                            </>
                          )}
                        </p>
                      </div>
                      <Badge variant={RESULTS_STATUS_BADGE_VARIANT[ep.resultsStatus]}>
                        {RESULTS_STATUS_BADGE_LABEL[ep.resultsStatus]}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    {ep.resultsStatus === "published" ? (
                      <div className="flex flex-col gap-3">
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
                                    <td className="p-2">{r.total}</td>
                                    <td className="whitespace-nowrap p-2 capitalize">{r.outcome.replace("_", " ")}</td>
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

                        <Dialog>
                          <DialogTrigger
                            render={<Button variant="outline" size="sm" className="self-start" disabled={correctingId === ep.id} />}
                          >
                            {correctingId === ep.id ? "Starting..." : "Correct Results"}
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Correct {formatEpisodeLabel(ep.week_number)}?</DialogTitle>
                              <DialogDescription>
                                This discards any unsaved draft edits for this week and starts a fresh
                                correction from what&apos;s currently published. Nothing changes for players
                                until you publish again.
                                {isCorrectingOlderWeek && mostRecentPublishedEpisode && (
                                  <span className="mt-2 block text-amber-700 dark:text-amber-400">
                                    {formatEpisodeLabel(mostRecentPublishedEpisode.week_number)}{" "}
                                    has already been published after this week — correcting an elimination
                                    here won&apos;t recompute that later week automatically. Double-check it
                                    still makes sense afterward.
                                  </span>
                                )}
                              </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                              <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                              <Button onClick={() => handleCorrect(ep.id)}>Start correction</Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <p className="text-sm text-muted-foreground">
                          This week has an unpublished draft — {coupleCount} couple
                          {coupleCount === 1 ? "" : "s"} entered so far.
                        </p>
                        <Button size="sm" variant="outline" className="self-start" onClick={() => onNavigateToEpisode(ep.id)}>
                          Continue in Enter Results
                        </Button>
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
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
              return {
                ...r,
                episode: episodes.find((e) => e.id === r.episode_id),
                dances,
                total: dances.reduce((sum, d) => sum + d.total_score, 0),
              };
            })
            .sort((a, b) => (a.episode?.week_number ?? 0) - (b.episode?.week_number ?? 0));

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
                    {history.map((h, i) => (
                      <Fragment key={i}>
                        <tr className={h.dances.length === 0 ? "border-b border-border last:border-b-0" : undefined}>
                          <td className="whitespace-nowrap p-2">
                            {h.episode ? formatEpisodeLabel(h.episode.week_number) : "Episode ?"}
                            {h.episode?.theme ? ` — ${h.episode.theme}` : ""}
                          </td>
                          <td className="p-2">{h.total}</td>
                          <td className="whitespace-nowrap p-2 capitalize">{h.outcome.replace("_", " ")}</td>
                          <td className="p-2 text-muted-foreground">{noteLabel(h) || "—"}</td>
                        </tr>
                        {h.dances.map((d, j) => (
                          <DanceBreakdownRow key={d.id} dance={d} colSpan={4} isLast={j === h.dances.length - 1} />
                        ))}
                      </Fragment>
                    ))}
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
