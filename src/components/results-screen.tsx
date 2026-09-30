"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AllResultsView } from "@/components/all-results-view";
import { PageHeader } from "@/components/page-header";
import { TopBar } from "@/components/top-bar";
import type { CoupleNameParts } from "@/lib/couple-display";
import type { ScoringJudge } from "@/lib/scoring-judges";
import type { AccountSettingsData } from "@/lib/account-settings-data";
import type { DraftState } from "@/lib/results-draft";

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

type TabValue = "week" | "couple";

// Settings' Episodes section shows By Week/By Couple as their own rows
// nested under "Scores" (results-nav.tsx), each linking with its own ?tab= —
// so this switcher is purely for flipping between the two once you're
// already on the page, not a landing choice. Enter Results
// (/admin/results/enter) and Schedule (/admin/schedule) are their own pages.
const SWITCHER_TABS: { value: TabValue; label: string }[] = [
  { value: "week", label: "By Week" },
  { value: "couple", label: "By Couple" },
];

export function ResultsScreen({
  accountSettingsData,
  viewerEmail,
  canPropose,
  allCouples,
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
  spoilerFreeMode,
  allowedWeekIds,
}: {
  accountSettingsData: AccountSettingsData;
  viewerEmail: string;
  canPropose: boolean;
  allCouples: Couple[];
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
  spoilerFreeMode: boolean;
  allowedWeekIds: string[];
}) {
  const router = useRouter();
  // The URL is the source of truth so Account Settings links (?tab=week,
  // ?tab=couple) work even when tapped while already on this page.
  const tab: TabValue = useSearchParams().get("tab") === "couple" ? "couple" : "week";
  // Next syncs native history.replaceState into useSearchParams, so switching
  // views doesn't trigger a server refetch of the page's data.
  const setTab = (next: TabValue) => window.history.replaceState(null, "", `?tab=${next}`);

  return (
    <div className="flex w-full flex-col gap-4 px-4 pt-8 pb-8">
      <TopBar {...accountSettingsData} email={viewerEmail} />

      <PageHeader title="Scores">
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
      </PageHeader>

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
        onNavigateToEpisode={(episodeId) => router.push(`/admin/results/enter?episode=${episodeId}`)}
        seasonNumber={season?.season_number ?? null}
        roundTypes={roundTypes}
        roundTypesByEpisode={roundTypesByEpisode}
        inJeopardyByEpisode={inJeopardyByEpisode}
        participantsByEpisode={participantsByEpisode}
        spoilerFreeMode={spoilerFreeMode}
        allowedWeekIds={new Set(allowedWeekIds)}
      />
    </div>
  );
}
