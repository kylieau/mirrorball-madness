"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ResultsForm } from "@/components/results-form";
import { AllResultsView } from "@/components/all-results-view";
import { PageHeader } from "@/components/page-header";
import { TopBar } from "@/components/top-bar";
import type { CoupleNameParts } from "@/lib/couple-display";
import type { ScoringJudge } from "@/lib/scoring-judges";
import type { AccountSettingsData } from "@/lib/account-settings-data";
import type { DraftState } from "@/lib/results-draft";
import { ArrowLeftIcon } from "lucide-react";

type Couple = { id: string; celebrity_name: string; pro_name: string };
type CoupleWithStatus = Couple & {
  status: string;
  elimination_week: number | null;
};
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
  expected_dance_count: number;
  judges_save_available: boolean;
  duration_minutes: number;
  status: string;
  results_published_at: string | null;
  results_published_by: string | null;
};
type CompetitionWeek = {
  id: string;
  week_number: number;
  theme: string | null;
  is_elimination_week: boolean;
  is_finale: boolean;
  is_double_elimination_week: boolean;
};
type Season = {
  id: string;
  premiere_date: string | null;
  total_episodes: number | null;
  finale_date: string | null;
  season_number: number | null;
} | null;

type TabValue = "week" | "couple" | "enter";

// Settings' Episodes section shows By Week/By Couple as their own rows
// nested under "Scores" (results-nav.tsx), each linking with its own ?tab= —
// so this switcher is purely for flipping between the two once you're
// already on the page, not a landing choice. Schedule lives on its own page
// (/admin/schedule), not as a tab here.
const SWITCHER_TABS: { value: TabValue; label: string }[] = [
  { value: "week", label: "By Week" },
  { value: "couple", label: "By Couple" },
];

export function ResultsScreen({
  accountSettingsData,
  viewerEmail,
  canPropose,
  activeCouples,
  allCouples,
  allCouplesWithStatus,
  activeCoupleDisplayNames,
  allCoupleDisplayNames,
  judges,
  danceStyles,
  episodes,
  weeks,
  danceScores,
  judgeScores,
  episodeResults,
  draftsByEpisode,
  revealedByEpisode,
  publishedByNames,
  season,
  participantsByEpisode,
  roundTypes,
  roundTypesByEpisode,
  inJeopardyByEpisode,
  spoilerFreeMode,
  allowedWeekIds,
}: {
  accountSettingsData: AccountSettingsData;
  viewerEmail: string;
  canPropose: boolean;
  activeCouples: Couple[];
  allCouples: Couple[];
  allCouplesWithStatus: CoupleWithStatus[];
  activeCoupleDisplayNames: Record<string, CoupleNameParts>;
  allCoupleDisplayNames: Record<string, CoupleNameParts>;
  judges: ScoringJudge[];
  danceStyles: Named[];
  episodes: Episode[];
  weeks: CompetitionWeek[];
  danceScores: DanceScore[];
  judgeScores: JudgeScore[];
  episodeResults: EpisodeResult[];
  draftsByEpisode: Record<string, DraftState>;
  revealedByEpisode: Record<string, Record<string, string>>;
  publishedByNames: Record<string, string>;
  season: Season;
  participantsByEpisode: Record<string, string[]>;
  roundTypes: Named[];
  roundTypesByEpisode: Record<string, string[]>;
  inJeopardyByEpisode: Record<string, string[]>;
  spoilerFreeMode: boolean;
  allowedWeekIds: string[];
}) {
  const { isSuperAdmin } = accountSettingsData;

  // The URL is the source of truth so Account Settings links (?tab=week,
  // ?tab=enter, …) work even when tapped while already on this page. "enter"
  // is only reachable by a propose-tier viewer.
  const requestedTab = useSearchParams().get("tab");
  const tab: TabValue =
    requestedTab === "enter" && canPropose ? "enter" : requestedTab === "couple" ? "couple" : "week";
  // Next syncs native history.replaceState into useSearchParams, so switching
  // tabs doesn't trigger a server refetch of the page's data.
  const setTab = (next: TabValue) => window.history.replaceState(null, "", `?tab=${next}`);
  // Lifted here so View Results' "Correct Results"/"Continue draft" can
  // jump to Enter Results already pointed at the right episode.
  const [forceSelectEpisodeId, setForceSelectEpisodeId] = useState<string | null>(null);

  function navigateToEpisode(episodeId: string) {
    setForceSelectEpisodeId(episodeId);
    setTab("enter");
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-8 pb-8">
      <TopBar {...accountSettingsData} email={viewerEmail} />

      <PageHeader title={tab === "enter" ? "Enter Results" : "Scores"}>
        {tab === "enter" ? (
          <Button size="sm" variant="ghost" className="-ml-2" onClick={() => setTab("week")}>
            <ArrowLeftIcon className="size-4" />
            Back to Scores
          </Button>
        ) : (
          <div className="flex gap-2">
            {SWITCHER_TABS.map(({ value, label }) => (
              <Button
                key={value}
                size="sm"
                variant={tab === value ? "default" : "outline"}
                onClick={() => setTab(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        )}
      </PageHeader>

      {tab === "enter" && canPropose && (
        <ResultsForm
          canPublish={isSuperAdmin}
          activeCouples={activeCouples}
          allCouplesWithStatus={allCouplesWithStatus}
          coupleDisplayNames={activeCoupleDisplayNames}
          allCoupleDisplayNames={allCoupleDisplayNames}
          judges={judges}
          danceStyles={danceStyles}
          episodes={episodes}
          weeks={weeks}
          draftsByEpisode={draftsByEpisode}
          revealedByEpisode={revealedByEpisode}
          forceSelectEpisodeId={forceSelectEpisodeId}
          participantsByEpisode={participantsByEpisode}
        />
      )}

      {(tab === "week" || tab === "couple") && (
        <AllResultsView
          view={tab}
          canPropose={canPropose}
          episodes={episodes}
          weeks={weeks}
          danceScores={danceScores}
          judgeScores={judgeScores}
          episodeResults={episodeResults}
          couples={allCouples}
          coupleDisplayNames={allCoupleDisplayNames}
          judges={judges}
          danceStyles={danceStyles}
          draftsByEpisode={draftsByEpisode}
          publishedByNames={publishedByNames}
          onNavigateToEpisode={navigateToEpisode}
          seasonNumber={season?.season_number ?? null}
          roundTypes={roundTypes}
          roundTypesByEpisode={roundTypesByEpisode}
          inJeopardyByEpisode={inJeopardyByEpisode}
          participantsByEpisode={participantsByEpisode}
          spoilerFreeMode={spoilerFreeMode}
          allowedWeekIds={new Set(allowedWeekIds)}
        />
      )}
    </div>
  );
}
