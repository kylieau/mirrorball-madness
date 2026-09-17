"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ResultsForm } from "@/components/results-form";
import { AllResultsView } from "@/components/all-results-view";
import { ScheduleManager } from "@/components/schedule-manager";
import { JudgesDanceStylesManager } from "@/components/judges-dance-styles-manager";
import { PageHeader } from "@/components/page-header";
import { TopBar } from "@/components/top-bar";
import { BOTTOM_NAV_CLEARANCE, BOTTOM_NAV_TABS_CLASS, BottomNav } from "@/components/bottom-nav";
import type { CoupleNameParts } from "@/lib/couple-display";
import type { ScoringJudge } from "@/lib/scoring-judges";
import type { AccountSettingsData } from "@/lib/account-settings-data";
import type { DraftState } from "@/lib/results-draft";
import { PlusCircleIcon, ListChecksIcon, CalendarIcon, SettingsIcon } from "lucide-react";

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
  is_elimination_week: boolean;
  is_double_elimination_week: boolean;
  results_published_at: string | null;
  results_published_by: string | null;
};
type Season = {
  id: string;
  premiere_date: string | null;
  total_episodes: number | null;
  finale_date: string | null;
  season_number: number | null;
} | null;

const TABS = [
  { value: "enter", label: "Enter Results", icon: PlusCircleIcon },
  { value: "view", label: "View Results", icon: ListChecksIcon },
  { value: "schedule", label: "Schedule", icon: CalendarIcon },
  { value: "manage", label: "Settings", icon: SettingsIcon },
] as const;

export function AdminResultsTabs({
  accountSettingsData,
  viewerEmail,
  activeCouples,
  allCouples,
  allCouplesWithStatus,
  activeCoupleDisplayNames,
  allCoupleDisplayNames,
  judges,
  danceStyles,
  episodes,
  danceScores,
  judgeScores,
  episodeResults,
  draftsByEpisode,
  publishedByNames,
  season,
  participantsByEpisode,
}: {
  accountSettingsData: AccountSettingsData;
  viewerEmail: string;
  activeCouples: Couple[];
  allCouples: Couple[];
  allCouplesWithStatus: CoupleWithStatus[];
  activeCoupleDisplayNames: Record<string, CoupleNameParts>;
  allCoupleDisplayNames: Record<string, CoupleNameParts>;
  judges: ScoringJudge[];
  danceStyles: Named[];
  episodes: Episode[];
  danceScores: DanceScore[];
  judgeScores: JudgeScore[];
  episodeResults: EpisodeResult[];
  draftsByEpisode: Record<string, DraftState>;
  publishedByNames: Record<string, string>;
  season: Season;
  participantsByEpisode: Record<string, string[]>;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("enter");
  // Lifted here so View Results' "Correct Results"/"Continue draft" can
  // jump to Enter Results already pointed at the right episode.
  const [forceSelectEpisodeId, setForceSelectEpisodeId] = useState<string | null>(null);

  function navigateToEpisode(episodeId: string) {
    setForceSelectEpisodeId(episodeId);
    setTab("enter");
  }

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-8">
        <TopBar {...accountSettingsData} email={viewerEmail} />

        <PageHeader title="Admin" />
      </div>

      <BottomNav>
        <TabsList className={`${BOTTOM_NAV_TABS_CLASS} rounded-none group-data-horizontal/tabs:h-auto`}>
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="h-auto flex-col gap-0.5 rounded-md px-2 py-1.5 sm:flex-row sm:gap-1.5 sm:px-3"
            >
              <Icon className="size-5 sm:size-4" />
              <span className="text-[10px] sm:text-sm">{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </BottomNav>

      <div className={`mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-6 ${BOTTOM_NAV_CLEARANCE}`}>
        <TabsContent value="enter">
          <ResultsForm
            activeCouples={activeCouples}
            allCouplesWithStatus={allCouplesWithStatus}
            coupleDisplayNames={activeCoupleDisplayNames}
            allCoupleDisplayNames={allCoupleDisplayNames}
            judges={judges}
            danceStyles={danceStyles}
            episodes={episodes}
            draftsByEpisode={draftsByEpisode}
            forceSelectEpisodeId={forceSelectEpisodeId}
            participantsByEpisode={participantsByEpisode}
            seasonNumber={season?.season_number ?? null}
          />
        </TabsContent>
        <TabsContent value="view">
          <AllResultsView
            episodes={episodes}
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
          />
        </TabsContent>
        <TabsContent value="schedule">
          <ScheduleManager
            episodes={episodes}
            episodeResults={episodeResults}
            draftsByEpisode={draftsByEpisode}
            season={season}
            seasonCouples={allCouplesWithStatus}
            participantsByEpisode={participantsByEpisode}
          />
        </TabsContent>
        <TabsContent value="manage">
          <JudgesDanceStylesManager judges={judges} danceStyles={danceStyles} />
        </TabsContent>
      </div>
    </Tabs>
  );
}
