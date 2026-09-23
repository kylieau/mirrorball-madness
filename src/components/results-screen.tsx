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
  publishedByNames,
  season,
  participantsByEpisode,
  roundTypes,
  roundTypesByEpisode,
  inJeopardyByEpisode,
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
  publishedByNames: Record<string, string>;
  season: Season;
  participantsByEpisode: Record<string, string[]>;
  roundTypes: Named[];
  roundTypesByEpisode: Record<string, string[]>;
  inJeopardyByEpisode: Record<string, string[]>;
}) {
  const { isSuperAdmin } = accountSettingsData;

  // Account Settings links straight to a destination (?tab=week, ?tab=enter,
  // …), so honour that over always landing on By Week — except "enter",
  // which only a propose-tier viewer can land on.
  const requestedTab = useSearchParams().get("tab");
  const initialTab: TabValue =
    requestedTab === "enter" && canPropose ? "enter" : requestedTab === "couple" ? "couple" : "week";

  const [tab, setTab] = useState<TabValue>(initialTab);
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
        />
      )}
    </div>
  );
}
