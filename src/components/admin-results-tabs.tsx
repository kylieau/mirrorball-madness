"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ResultsForm } from "@/components/results-form";
import { AllResultsView } from "@/components/all-results-view";
import { ScheduleManager } from "@/components/schedule-manager";
import { JudgesDanceStylesManager } from "@/components/judges-dance-styles-manager";
import { PageHeader } from "@/components/page-header";
import type { CoupleNameParts } from "@/lib/couple-display";
import { PlusCircleIcon, ListChecksIcon, CalendarIcon, SettingsIcon } from "lucide-react";

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
  was_bottom_two: boolean;
  was_bottom_three: boolean;
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
};

const TABS = [
  { value: "enter", label: "Enter Results", icon: PlusCircleIcon },
  { value: "view", label: "View Results", icon: ListChecksIcon },
  { value: "schedule", label: "Schedule", icon: CalendarIcon },
  { value: "manage", label: "Settings", icon: SettingsIcon },
] as const;

export function AdminResultsTabs({
  viewerDisplayName,
  activeCouples,
  allCouples,
  activeCoupleDisplayNames,
  allCoupleDisplayNames,
  judges,
  danceStyles,
  episodes,
  danceScores,
  judgeScores,
  episodeResults,
}: {
  viewerDisplayName: string;
  activeCouples: Couple[];
  allCouples: Couple[];
  activeCoupleDisplayNames: Record<string, CoupleNameParts>;
  allCoupleDisplayNames: Record<string, CoupleNameParts>;
  judges: Named[];
  danceStyles: Named[];
  episodes: Episode[];
  danceScores: DanceScore[];
  judgeScores: JudgeScore[];
  episodeResults: EpisodeResult[];
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("enter");

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pt-8">
        <div className="flex items-start justify-between gap-4">
          <Link href="/today" className="text-xs font-medium text-muted-foreground">
            🪩 Mirrorball Madness
          </Link>
          <div className="flex gap-2">
            <Button
              render={<Link href="/settings?from=%2Fadmin%2Fresults" />}
              nativeButton={false}
              variant="outline"
              size="icon-sm"
              aria-label="Settings"
            >
              <SettingsIcon />
            </Button>
            <Button
              render={<Link href="/settings?from=%2Fadmin%2Fresults" />}
              nativeButton={false}
              size="icon-sm"
              aria-label="Account settings"
              className="rounded-full font-bold"
            >
              {viewerDisplayName.charAt(0).toUpperCase()}
            </Button>
          </div>
        </div>

        <PageHeader title="Admin" />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] sm:static sm:border-t-0 sm:border-b sm:pb-0">
        <div className="mx-auto max-w-3xl px-4">
          <TabsList className="h-auto w-full justify-around rounded-none bg-transparent p-1 group-data-horizontal/tabs:h-auto sm:w-fit sm:justify-start sm:gap-1">
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
        </div>
      </div>

      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 pb-20 pt-6 sm:pb-12">
        <TabsContent value="enter">
          <ResultsForm
            couples={activeCouples}
            coupleDisplayNames={activeCoupleDisplayNames}
            judges={judges}
            danceStyles={danceStyles}
            episodes={episodes}
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
          />
        </TabsContent>
        <TabsContent value="schedule">
          <ScheduleManager episodes={episodes} />
        </TabsContent>
        <TabsContent value="manage">
          <JudgesDanceStylesManager judges={judges} danceStyles={danceStyles} />
        </TabsContent>
      </div>
    </Tabs>
  );
}
