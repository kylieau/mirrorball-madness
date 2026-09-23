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
import { ArrowLeftIcon, ChevronRightIcon } from "lucide-react";

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

type TabValue = "chooser" | "week" | "couple" | "enter";

// These are the two sub-options under Settings' single "Scores" row — not
// separate settings rows themselves, so there's no order to keep in sync.
// Schedule lives on its own page (/admin/schedule), not as a tab here.
const SWITCHER_TABS: { value: "week" | "couple"; label: string; hint: string }[] = [
  { value: "week", label: "By Week", hint: "Judges' scores and outcomes, grouped by episode" },
  { value: "couple", label: "By Couple", hint: "Judges' scores and outcomes, grouped by couple" },
];

// The "before opening either page" landing shown when Scores is reached with
// no specific view requested — e.g. straight from Settings' single "Scores"
// row, which no longer defaults to By Week. Once one is picked, the compact
// switcher in the header takes over for flipping between the two.
function ScoresChooser({ onSelect }: { onSelect: (tab: "week" | "couple") => void }) {
  return (
    <div className="rounded-2xl border border-border">
      {SWITCHER_TABS.map(({ value, label, hint }, i) => (
        <button
          key={value}
          onClick={() => onSelect(value)}
          className={`flex w-full items-center justify-between px-4 py-4 text-left transition-colors hover:bg-muted ${
            i > 0 ? "border-t border-border" : ""
          }`}
        >
          <span>
            <span className="block font-medium">{label}</span>
            <span className="block text-sm text-muted-foreground">{hint}</span>
          </span>
          <ChevronRightIcon className="size-4 text-muted-foreground" />
        </button>
      ))}
    </div>
  );
}

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
}) {
  const { isSuperAdmin } = accountSettingsData;

  // Account Settings' "Scores" row links with no ?tab= at all, landing on the
  // chooser below; "enter" (only when propose-tier) and direct ?tab=week/
  // couple links (e.g. Correct Results elsewhere) still skip straight past it.
  const requestedTab = useSearchParams().get("tab");
  const initialTab: TabValue =
    requestedTab === "enter" && canPropose
      ? "enter"
      : requestedTab === "week" || requestedTab === "couple"
        ? requestedTab
        : "chooser";

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

      <PageHeader title="Scores">
        {tab === "enter" ? (
          <Button size="sm" variant="ghost" className="-ml-2" onClick={() => setTab("week")}>
            <ArrowLeftIcon className="size-4" />
            Back to Scores
          </Button>
        ) : tab === "week" || tab === "couple" ? (
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
        ) : null}
      </PageHeader>

      {tab === "chooser" && <ScoresChooser onSelect={setTab} />}

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
        />
      )}
    </div>
  );
}
