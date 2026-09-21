"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  updateScoringCategories,
  updateLeagueSettings,
  syncSeasonClockAnchor,
  type ScoringCategoriesInput,
  type LeagueSettingsInput,
} from "@/app/leagues/[id]/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingRow } from "@/components/setting-row";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useBrowserTimeZone,
  useFormattedDeadline,
  airsAtToUtcIso,
  utcIsoToLocalInput,
} from "@/lib/use-browser-time-zone";
import {
  GRAND_FINALE_DEFAULT_DISTANCE_PENALTY,
  GRAND_FINALE_DEFAULT_METHOD,
  GRAND_FINALE_DEFAULT_TIER_PAY_STYLE,
  GRAND_FINALE_DEFAULT_TIER_SIZE,
  defaultPointsPerCorrect,
  explainGrandFinaleMethod,
  type GrandFinaleMethod,
  type TierPayStyle,
} from "@/lib/grand-finale-explainer";
import { formatEpisodeCasual } from "@/lib/format-week";
import { SCORING_MODULES } from "@/lib/scoring-modules";
import { BottomNav } from "@/components/bottom-nav";
import {
  airsAtForWeek,
  explainGrandFinaleDeadline,
  explainSeasonClock,
  formatLockWithEpisode,
  previewLockWeek,
  shouldShowAnchorSyncControl,
} from "@/lib/season-clock";

type ScoringMethod = GrandFinaleMethod;
type WaiverMode = "locked" | "waivers";
type WaiverClaimMethod = "reverse_standings" | "fcfs" | "manual";
type DraftType = "snake" | "linear";

type ScoringSettings = {
  judges_score_category_enabled: boolean;
  eliminations_category_enabled: boolean;
  bonus_picks_category_enabled: boolean;
  judges_score_category_weight: number;
  eliminations_category_weight: number;
  bonus_picks_category_weight: number;
  judges_score_starts_week: number;
  bonus_picks_scoring_method: string | null;
  bonus_picks_distance_penalty: number | null;
  bonus_picks_tier_size: number | null;
  bonus_picks_tier_pay_style: string;
  bonus_picks_points_per_correct: number;
  bonus_picks_first_place_points: number;
  bonus_picks_second_place_points: number;
  bonus_picks_third_place_points: number;
  bonus_picks_fourth_place_points: number;
  bonus_picks_fifth_place_points: number;
  judges_score_multiplier: number;
  survival_points: number;
  first_place_points: number;
  second_place_points: number;
  third_place_points: number;
  fourth_place_points: number;
  fifth_place_points: number;
  elimination_prediction_points: number;
  top_scorer_prediction_points: number;
  scoring_configured: boolean;
};

type League = {
  waiver_mode: string;
  waiver_claim_method: string | null;
  pick_time_limit_seconds: number;
  prediction_lock_hours_before_air: number;
  draft_status: string;
  draft_type: string;
  draft_scheduled_at: string | null;
};

type SeasonEpisode = { week_number: number; theme: string | null; airs_at: string };

const METHOD_ITEMS: Record<ScoringMethod, string> = {
  exact_position: "Exact Position",
  distance_based: "Distance-Based Partial Credit",
  band_tier: "Tier bands",
};

const TIER_PAY_STYLE_ITEMS: Record<TierPayStyle, string> = {
  equal: "Equal Pay for Every Band",
  graded: "Graded (Lower Bands Pay Less)",
};

const WAIVER_MODE_ITEMS: Record<WaiverMode, string> = {
  locked: "Locked (No Recast)",
  waivers: "Recast Enabled",
};

const WAIVER_CLAIM_METHOD_ITEMS: Record<WaiverClaimMethod, string> = {
  reverse_standings: "Reverse Standings",
  fcfs: "First Come, First Served",
  manual: "Manual (Commissioner Decides)",
};

const DRAFT_TYPE_ITEMS: Record<DraftType, string> = {
  snake: "Snake (Reverses Order Each Round)",
  linear: "Linear (Same Order Every Round)",
};

export function LeagueModulesForm({
  leagueId,
  league,
  scoringSettings,
  canEdit,
  seasonEpisodes,
  seasonNumber,
  effectiveHardDeadlineWeek,
  totalCouples,
  exitHref,
}: {
  leagueId: string;
  league: League;
  scoringSettings: ScoringSettings | null;
  canEdit: boolean;
  seasonEpisodes: SeasonEpisode[];
  seasonNumber: number | null;
  // effective_hard_deadline_week — the episode Grand Finale actually locks
  // at. May have auto-advanced past the commissioner's Anchor week while a
  // Dance Card draft is still open; the Season Clock labels that episode
  // next to its airs_at so the two can't look like a mismatched pair.
  effectiveHardDeadlineWeek: number | null;
  // Active-season cast size, so the band preview shows real place ranges.
  totalCouples: number;
  // Where "Save & exit" lands (the page the settings were opened from).
  exitHref: string;
}) {
  const router = useRouter();
  const browserTimeZone = useBrowserTimeZone();

  const [judgesEnabled, setJudgesEnabled] = useState(
    scoringSettings?.judges_score_category_enabled ?? true
  );
  const [eliminationsEnabled, setEliminationsEnabled] = useState(
    scoringSettings?.eliminations_category_enabled ?? true
  );
  const [bonusEnabled, setBonusEnabled] = useState(
    scoringSettings?.bonus_picks_category_enabled ?? false
  );

  const moduleEnabled = { curtainCall: eliminationsEnabled, danceCard: judgesEnabled, grandFinale: bonusEnabled };
  const setModuleEnabled = {
    curtainCall: setEliminationsEnabled,
    danceCard: setJudgesEnabled,
    grandFinale: setBonusEnabled,
  };

  const [judgesWeight, setJudgesWeight] = useState(
    scoringSettings?.judges_score_category_weight ?? 1
  );
  const [eliminationsWeight, setEliminationsWeight] = useState(
    scoringSettings?.eliminations_category_weight ?? 1
  );
  const [bonusWeight, setBonusWeight] = useState(
    scoringSettings?.bonus_picks_category_weight ?? 1
  );

  const [judgesStartsWeek, setJudgesStartsWeek] = useState(scoringSettings?.judges_score_starts_week ?? 1);
  const startsWeekItems = Object.fromEntries(
    seasonEpisodes.length > 0
      ? seasonEpisodes.map((e) => [String(e.week_number), formatEpisodeCasual(e.week_number)])
      : [[String(judgesStartsWeek), formatEpisodeCasual(judgesStartsWeek)]]
  );
  const [judgesScoreMultiplier, setJudgesScoreMultiplier] = useState(
    scoringSettings?.judges_score_multiplier ?? 1
  );
  const [survivalPoints, setSurvivalPoints] = useState(scoringSettings?.survival_points ?? 15);
  const [firstPlacePoints, setFirstPlacePoints] = useState(
    scoringSettings?.first_place_points ?? 150
  );
  const [secondPlacePoints, setSecondPlacePoints] = useState(
    scoringSettings?.second_place_points ?? 75
  );
  const [thirdPlacePoints, setThirdPlacePoints] = useState(
    scoringSettings?.third_place_points ?? 40
  );
  const [fourthPlacePoints, setFourthPlacePoints] = useState(
    scoringSettings?.fourth_place_points ?? 14
  );
  const [fifthPlacePoints, setFifthPlacePoints] = useState(
    scoringSettings?.fifth_place_points ?? 7
  );
  const [waiverMode, setWaiverMode] = useState<WaiverMode>(
    (league.waiver_mode as WaiverMode) ?? "reverse_standings"
  );
  const [waiverClaimMethod, setWaiverClaimMethod] = useState<WaiverClaimMethod>(
    (league.waiver_claim_method as WaiverClaimMethod) ?? "reverse_standings"
  );
  const [pickTimeLimitSeconds, setPickTimeLimitSeconds] = useState(league.pick_time_limit_seconds);
  const [draftType, setDraftType] = useState<DraftType>((league.draft_type as DraftType) ?? "snake");
  const [draftScheduledAt, setDraftScheduledAt] = useState(
    league.draft_scheduled_at ? utcIsoToLocalInput(league.draft_scheduled_at) : ""
  );
  const formattedDraftScheduledAt = useFormattedDeadline(draftScheduledAt || null);
  const draftNotStarted = league.draft_status === "not_started";

  const [eliminationPredictionPoints, setEliminationPredictionPoints] = useState(
    scoringSettings?.elimination_prediction_points ?? 171
  );
  const [topScorerPredictionPoints, setTopScorerPredictionPoints] = useState(
    scoringSettings?.top_scorer_prediction_points ?? 114
  );
  const [predictionLockHoursBeforeAir, setPredictionLockHoursBeforeAir] = useState(
    league.prediction_lock_hours_before_air
  );

  const [bonusMethod, setBonusMethod] = useState<ScoringMethod>(
    (scoringSettings?.bonus_picks_scoring_method as ScoringMethod) ?? GRAND_FINALE_DEFAULT_METHOD
  );
  const [bonusDistancePenalty, setBonusDistancePenalty] = useState(
    scoringSettings?.bonus_picks_distance_penalty ?? GRAND_FINALE_DEFAULT_DISTANCE_PENALTY
  );
  const [bonusTierSize, setBonusTierSize] = useState(
    scoringSettings?.bonus_picks_tier_size ?? GRAND_FINALE_DEFAULT_TIER_SIZE
  );
  const [bonusTierPayStyle, setBonusTierPayStyle] = useState<TierPayStyle>(
    (scoringSettings?.bonus_picks_tier_pay_style as TierPayStyle) ?? GRAND_FINALE_DEFAULT_TIER_PAY_STYLE
  );
  const [bonusPicksPointsPerCorrect, setBonusPicksPointsPerCorrect] = useState(
    scoringSettings?.bonus_picks_points_per_correct ??
      defaultPointsPerCorrect(GRAND_FINALE_DEFAULT_METHOD, GRAND_FINALE_DEFAULT_TIER_PAY_STYLE)
  );
  // Switching method/pay style re-applies that option's calibrated base, but
  // never overwrites a number the commissioner typed themselves.
  const [pointsPerCorrectEdited, setPointsPerCorrectEdited] = useState(false);

  function changeBonusMethod(method: ScoringMethod) {
    setBonusMethod(method);
    if (!pointsPerCorrectEdited) {
      setBonusPicksPointsPerCorrect(defaultPointsPerCorrect(method, bonusTierPayStyle));
    }
  }

  function changeTierPayStyle(style: TierPayStyle) {
    setBonusTierPayStyle(style);
    if (!pointsPerCorrectEdited) {
      setBonusPicksPointsPerCorrect(defaultPointsPerCorrect(bonusMethod, style));
    }
  }

  const explainMethod = () =>
    explainGrandFinaleMethod({
      method: bonusMethod,
      pointsPerCorrect: bonusPicksPointsPerCorrect,
      distancePenalty: bonusDistancePenalty,
      tierSize: bonusTierSize,
      tierPayStyle: bonusTierPayStyle,
      totalCouples,
    });
  const [bonusPicksFirstPlacePoints, setBonusPicksFirstPlacePoints] = useState(
    scoringSettings?.bonus_picks_first_place_points ?? 106
  );
  const [bonusPicksSecondPlacePoints, setBonusPicksSecondPlacePoints] = useState(
    scoringSettings?.bonus_picks_second_place_points ?? 53
  );
  const [bonusPicksThirdPlacePoints, setBonusPicksThirdPlacePoints] = useState(
    scoringSettings?.bonus_picks_third_place_points ?? 28
  );
  const [bonusPicksFourthPlacePoints, setBonusPicksFourthPlacePoints] = useState(
    scoringSettings?.bonus_picks_fourth_place_points ?? 14
  );
  const [bonusPicksFifthPlacePoints, setBonusPicksFifthPlacePoints] = useState(
    scoringSettings?.bonus_picks_fifth_place_points ?? 7
  );

  const [submitting, setSubmitting] = useState(false);
  const [syncingAnchor, setSyncingAnchor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const lockWeek = previewLockWeek({
    anchorWeek: judgesStartsWeek,
    effectiveHardDeadlineWeek,
    danceCardEnabled: judgesEnabled,
    draftStatus: league.draft_status,
  });
  const lockAirsAt = airsAtForWeek(seasonEpisodes, lockWeek);
  const formattedLockAirsAt = useFormattedDeadline(lockAirsAt);
  const lockDisplay = formatLockWithEpisode(
    lockWeek,
    seasonNumber,
    formattedLockAirsAt,
    lockAirsAt != null
  );
  const seasonClockCopy = explainSeasonClock({
    anchorWeek: judgesStartsWeek,
    lockWeek,
    seasonNumber,
    danceCardEnabled: judgesEnabled,
    draftStatus: league.draft_status,
  });
  const grandFinaleDeadlineCopy = explainGrandFinaleDeadline({
    anchorWeek: judgesStartsWeek,
    lockWeek,
    seasonNumber,
  });
  const showAnchorSync = shouldShowAnchorSyncControl(canEdit, judgesStartsWeek, lockWeek);

  async function handleSave(exitAfter = false) {
    setError(null);
    setSyncError(null);
    setSuccess(false);

    if (!judgesEnabled && !eliminationsEnabled && !bonusEnabled) {
      setError("At least one module must stay on.");
      return;
    }

    if (judgesEnabled && pickTimeLimitSeconds < 10) {
      setError("Draft Pick Timer must be at least 10 seconds.");
      return;
    }

    if (eliminationsEnabled && predictionLockHoursBeforeAir < 0) {
      setError("Pick 'Em Lock can't be negative.");
      return;
    }

    setSubmitting(true);

    const scoringInput: ScoringCategoriesInput = {
      judgesScoreCategoryEnabled: judgesEnabled,
      eliminationsCategoryEnabled: eliminationsEnabled,
      bonusPicksCategoryEnabled: bonusEnabled,
      judgesScoreCategoryWeight: judgesWeight,
      eliminationsCategoryWeight: eliminationsWeight,
      bonusPicksCategoryWeight: bonusWeight,
      judgesScoreStartsWeek: judgesStartsWeek,
      bonusPicksScoringMethod: bonusEnabled ? bonusMethod : null,
      bonusPicksDistancePenalty: bonusEnabled && bonusMethod === "distance_based" ? bonusDistancePenalty : null,
      bonusPicksTierSize: bonusEnabled && bonusMethod === "band_tier" ? bonusTierSize : null,
      bonusPicksTierPayStyle: bonusTierPayStyle,
      judgesScoreMultiplier,
      survivalPoints,
      firstPlacePoints,
      secondPlacePoints,
      thirdPlacePoints,
      fourthPlacePoints,
      fifthPlacePoints,
      eliminationPredictionPoints,
      topScorerPredictionPoints,
      bonusPicksPointsPerCorrect,
      bonusPicksFirstPlacePoints,
      bonusPicksSecondPlacePoints,
      bonusPicksThirdPlacePoints,
      bonusPicksFourthPlacePoints,
      bonusPicksFifthPlacePoints,
    };

    const leagueInput: LeagueSettingsInput = {
      waiverMode,
      waiverClaimMethod,
      pickTimeLimitSeconds,
      predictionLockHoursBeforeAir,
      draftType,
      draftScheduledAt: draftScheduledAt ? airsAtToUtcIso(draftScheduledAt) : null,
    };

    const [scoringResult, leagueResult] = await Promise.all([
      updateScoringCategories(leagueId, scoringInput),
      updateLeagueSettings(leagueId, leagueInput),
    ]);

    const combinedError = scoringResult.error || leagueResult.error;
    if (combinedError) {
      setError(combinedError);
      setSubmitting(false);
    } else if (exitAfter) {
      router.push(exitHref);
    } else {
      setSuccess(true);
      setSubmitting(false);
    }
  }

  async function handleSyncAnchor() {
    setError(null);
    setSyncError(null);
    setSuccess(false);
    setSyncingAnchor(true);
    const result = await syncSeasonClockAnchor(leagueId);
    if (result.error) {
      setSyncError(result.error);
    } else if (result.anchorWeek != null) {
      setJudgesStartsWeek(result.anchorWeek);
      router.refresh();
    }
    setSyncingAnchor(false);
  }

  const isRequired = !scoringSettings?.scoring_configured;

  if (!canEdit) {
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Modules</CardTitle>
            <CardDescription>Which modules this league runs.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col">
            {SCORING_MODULES.map((m) => (
              <div
                key={m.name}
                className="grid grid-cols-[1fr_1fr_auto] items-center gap-4 border-b border-border py-2 text-sm last:border-b-0"
              >
                <span className="font-medium">{m.name}</span>
                <span className="text-muted-foreground">{m.description}</span>
                <span className="font-medium">
                  {moduleEnabled[m.key] ? "On" : "Off"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Season Clock</CardTitle>
            <CardDescription>Your league&apos;s Hard Deadline — the one week everything else locks around.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col">
            <SettingRow label="Anchor Week" value={formatEpisodeCasual(judgesStartsWeek)} />
            <SettingRow
              label="Currently Locks"
              value={<span className="max-w-[60%] text-right leading-snug">{lockDisplay}</span>}
            />
            <p className="pt-2 text-sm text-muted-foreground">{seasonClockCopy}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scoring Mix</CardTitle>
            <CardDescription>How much each active module counts toward Standings.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col">
            {eliminationsEnabled && <SettingRow label="Curtain Call" value={eliminationsWeight} />}
            {judgesEnabled && <SettingRow label="Dance Card" value={judgesWeight} />}
            {bonusEnabled && <SettingRow label="Grand Finale" value={bonusWeight} />}
          </CardContent>
        </Card>

        {eliminationsEnabled && (
          <Card>
            <CardHeader>
              <CardTitle>Curtain Call</CardTitle>
              <CardDescription>Weekly elimination and top-scorer picks.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col">
              <SettingRow label="Elimination Prediction Points" value={eliminationPredictionPoints} />
              <SettingRow label="Top Scorer Prediction Points" value={topScorerPredictionPoints} />
              <SettingRow label="Pick 'Em Lock" value={`${predictionLockHoursBeforeAir}h before air`} />
            </CardContent>
          </Card>
        )}

        {judgesEnabled && (
          <Card>
            <CardHeader>
              <CardTitle>Dance Card</CardTitle>
              <CardDescription>Draft, roster, Recast, and judges&apos; score points.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col">
              <SettingRow label="Judges' Score Multiplier" value={judgesScoreMultiplier} />
              <SettingRow label="Survival Points" value={survivalPoints} />
              <SettingRow label="1st Place Bonus" value={firstPlacePoints} />
              <SettingRow label="2nd Place Bonus" value={secondPlacePoints} />
              <SettingRow label="3rd Place Bonus" value={thirdPlacePoints} />
              <SettingRow label="4th Place Bonus" value={fourthPlacePoints} />
              <SettingRow label="5th Place Bonus" value={fifthPlacePoints} />
              <SettingRow label="Recast Mode" value={WAIVER_MODE_ITEMS[waiverMode]} />
              {waiverMode === "waivers" && (
                <SettingRow label="Recast Method" value={WAIVER_CLAIM_METHOD_ITEMS[waiverClaimMethod]} />
              )}
              <SettingRow label="Draft Pick Timer" value={`${pickTimeLimitSeconds}s`} />
              <SettingRow label="Draft Type" value={DRAFT_TYPE_ITEMS[draftType]} />
              {draftScheduledAt && (
                <SettingRow label="Draft Scheduled For" value={formattedDraftScheduledAt || "—"} />
              )}
            </CardContent>
          </Card>
        )}

        {bonusEnabled && (
          <Card>
            <CardHeader>
              <CardTitle>Grand Finale</CardTitle>
              <CardDescription>Points from a season-long guess of the full elimination order.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col">
              <SettingRow
                label="Deadline"
                value={<span className="max-w-[60%] text-right leading-snug">{lockDisplay}</span>}
              />
              <SettingRow label="Points per Correctly-Placed Couple" value={bonusPicksPointsPerCorrect} />
              <SettingRow label="Scoring Method" value={METHOD_ITEMS[bonusMethod]} />
              {bonusMethod === "distance_based" && (
                <SettingRow label="Points Lost per Spot Off" value={bonusDistancePenalty} />
              )}
              {bonusMethod === "band_tier" && (
                <>
                  <SettingRow label="Couples per Band" value={bonusTierSize} />
                  <SettingRow label="Band Pay" value={TIER_PAY_STYLE_ITEMS[bonusTierPayStyle]} />
                </>
              )}
              <p className="pt-2 text-sm text-muted-foreground">{explainMethod()}</p>
              <SettingRow label="1st Place Bonus" value={bonusPicksFirstPlacePoints} />
              <SettingRow label="2nd Place Bonus" value={bonusPicksSecondPlacePoints} />
              <SettingRow label="3rd Place Bonus" value={bonusPicksThirdPlacePoints} />
              <SettingRow label="4th Place Bonus" value={bonusPicksFourthPlacePoints} />
              <SettingRow label="5th Place Bonus" value={bonusPicksFifthPlacePoints} />
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className={isRequired ? "border-primary" : undefined}>
        <CardHeader>
          <CardTitle>Modules</CardTitle>
          <CardDescription>
            Turn each module on or off. A section for its settings appears below once it&apos;s on.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {isRequired && (
            <p className="text-sm font-medium text-primary">
              Required — save this before the rest of your league is available.
            </p>
          )}
          <div className="flex flex-col">
            {SCORING_MODULES.map((m) => (
              <label
                key={m.key}
                className="grid grid-cols-[1fr_1fr] items-center gap-4 border-b border-border py-2 text-sm last:border-b-0"
              >
                <span className="flex items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    checked={moduleEnabled[m.key]}
                    onChange={(e) => setModuleEnabled[m.key](e.target.checked)}
                  />
                  {m.name}
                </span>
                <span className="text-muted-foreground">{m.description}</span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Season Clock</CardTitle>
          <CardDescription>Your league&apos;s Hard Deadline — the one week everything else locks around.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="judgesStartsWeek">Anchor Week</Label>
              <Select
                items={startsWeekItems}
                value={String(judgesStartsWeek)}
                onValueChange={(v) => v && setJudgesStartsWeek(Number(v))}
              >
                <SelectTrigger id="judgesStartsWeek" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(startsWeekItems).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Currently Locks</Label>
              <p className="flex min-h-8 items-center text-sm">{lockDisplay}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{seasonClockCopy}</p>
          {showAnchorSync && (
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                disabled={syncingAnchor || submitting}
                onClick={handleSyncAnchor}
              >
                {syncingAnchor ? "Updating..." : "Update Anchor to match lock"}
              </Button>
              {syncError && <p className="text-sm text-destructive">{syncError}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scoring Mix</CardTitle>
          <CardDescription>How much each active module counts toward Standings.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {eliminationsEnabled && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="eliminationsWeight">Curtain Call</Label>
              <Input
                id="eliminationsWeight"
                type="number"
                step="0.1"
                min={0}
                value={eliminationsWeight}
                onChange={(e) => setEliminationsWeight(Number(e.target.value))}
              />
            </div>
          )}
          {judgesEnabled && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="judgesWeight">Dance Card</Label>
              <Input
                id="judgesWeight"
                type="number"
                step="0.1"
                min={0}
                value={judgesWeight}
                onChange={(e) => setJudgesWeight(Number(e.target.value))}
              />
            </div>
          )}
          {bonusEnabled && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="bonusWeight">Grand Finale</Label>
              <Input
                id="bonusWeight"
                type="number"
                step="0.1"
                min={0}
                value={bonusWeight}
                onChange={(e) => setBonusWeight(Number(e.target.value))}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {eliminationsEnabled && (
        <Card>
          <CardHeader>
            <CardTitle>Curtain Call</CardTitle>
            <CardDescription>Weekly elimination and top-scorer picks.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="predictionLockHoursBeforeAir">Pick &apos;Em Lock (Hours Before Air)</Label>
                <Input
                  id="predictionLockHoursBeforeAir"
                  type="number"
                  step="0.5"
                  min={0}
                  value={predictionLockHoursBeforeAir}
                  onChange={(e) => setPredictionLockHoursBeforeAir(Number(e.target.value))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="eliminationPredictionPoints">Elimination Prediction Points</Label>
                <Input
                  id="eliminationPredictionPoints"
                  type="number"
                  min={0}
                  value={eliminationPredictionPoints}
                  onChange={(e) => setEliminationPredictionPoints(Number(e.target.value))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="topScorerPredictionPoints">Top Scorer Prediction Points</Label>
                <Input
                  id="topScorerPredictionPoints"
                  type="number"
                  min={0}
                  value={topScorerPredictionPoints}
                  onChange={(e) => setTopScorerPredictionPoints(Number(e.target.value))}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {judgesEnabled && (
        <Card>
          <CardHeader>
            <CardTitle>Dance Card</CardTitle>
            <CardDescription>
              Draft, roster, Recast, and judges&apos; score points. Roster size is set
              automatically when the draft starts (couples ÷ members).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="judgesScoreMultiplier">Judges&apos; Score Multiplier</Label>
                <Input
                  id="judgesScoreMultiplier"
                  type="number"
                  step="0.1"
                  min={0}
                  value={judgesScoreMultiplier}
                  onChange={(e) => setJudgesScoreMultiplier(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Auto-calibrated to your roster size once the draft starts, unless you change it here first.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="survivalPoints">Survival Points</Label>
                <Input
                  id="survivalPoints"
                  type="number"
                  min={0}
                  value={survivalPoints}
                  onChange={(e) => setSurvivalPoints(Number(e.target.value))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="firstPlacePoints">1st Place Bonus</Label>
                <Input
                  id="firstPlacePoints"
                  type="number"
                  min={0}
                  value={firstPlacePoints}
                  onChange={(e) => setFirstPlacePoints(Number(e.target.value))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="secondPlacePoints">2nd Place Bonus</Label>
                <Input
                  id="secondPlacePoints"
                  type="number"
                  min={0}
                  value={secondPlacePoints}
                  onChange={(e) => setSecondPlacePoints(Number(e.target.value))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="thirdPlacePoints">3rd Place Bonus</Label>
                <Input
                  id="thirdPlacePoints"
                  type="number"
                  min={0}
                  value={thirdPlacePoints}
                  onChange={(e) => setThirdPlacePoints(Number(e.target.value))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="fourthPlacePoints">4th Place Bonus</Label>
                <Input
                  id="fourthPlacePoints"
                  type="number"
                  min={0}
                  value={fourthPlacePoints}
                  onChange={(e) => setFourthPlacePoints(Number(e.target.value))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="fifthPlacePoints">5th Place Bonus</Label>
                <Input
                  id="fifthPlacePoints"
                  type="number"
                  min={0}
                  value={fifthPlacePoints}
                  onChange={(e) => setFifthPlacePoints(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="waiverMode">Recast Mode</Label>
                  <Select
                    items={WAIVER_MODE_ITEMS}
                    value={waiverMode}
                    onValueChange={(v) => setWaiverMode((v as WaiverMode) ?? "locked")}
                  >
                    <SelectTrigger id="waiverMode" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="locked">Locked (No Recast)</SelectItem>
                      <SelectItem value="waivers">Recast Enabled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="pickTimeLimitSeconds">Draft Pick Timer (Seconds)</Label>
                  <Input
                    id="pickTimeLimitSeconds"
                    type="number"
                    min={10}
                    value={pickTimeLimitSeconds}
                    onChange={(e) => setPickTimeLimitSeconds(Number(e.target.value))}
                  />
                </div>
                {waiverMode === "waivers" && (
                  <div className="flex flex-col gap-2 sm:col-span-2">
                    <Label htmlFor="waiverClaimMethod">Recast Method</Label>
                    <Select
                      items={WAIVER_CLAIM_METHOD_ITEMS}
                      value={waiverClaimMethod}
                      onValueChange={(v) => setWaiverClaimMethod((v as WaiverClaimMethod) ?? "reverse_standings")}
                    >
                      <SelectTrigger id="waiverClaimMethod" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="reverse_standings">Reverse Standings</SelectItem>
                        <SelectItem value="fcfs">First Come, First Served</SelectItem>
                        <SelectItem value="manual">Manual (Commissioner Decides)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>

            {draftNotStarted ? (
              <div className="border-t border-border pt-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="draftType">Draft Type</Label>
                    <Select
                      items={DRAFT_TYPE_ITEMS}
                      value={draftType}
                      onValueChange={(v) => setDraftType((v as DraftType) ?? "snake")}
                    >
                      <SelectTrigger id="draftType" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="snake">Snake</SelectItem>
                        <SelectItem value="linear">Linear</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="draftScheduledAt">
                      Draft Scheduled For{browserTimeZone ? ` (${browserTimeZone})` : ""}
                    </Label>
                    <Input
                      id="draftScheduledAt"
                      type="datetime-local"
                      value={draftScheduledAt}
                      onChange={(e) => setDraftScheduledAt(e.target.value)}
                    />
                  </div>
                </div>
                <p className="pt-2 text-sm text-muted-foreground">
                  The scheduled time is informational only — the commissioner still starts the draft manually from
                  the draft room whenever your league is ready.
                </p>
              </div>
            ) : (
              <div className="border-t border-border pt-4 text-sm text-muted-foreground">
                Draft Type and Scheduled For can only be changed before the draft starts.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {bonusEnabled && (
        <Card>
          <CardHeader>
            <CardTitle>Grand Finale</CardTitle>
            <CardDescription>Points from a season-long guess of the full elimination order.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label>Deadline{browserTimeZone ? ` (${browserTimeZone})` : ""}</Label>
                <p className="flex min-h-8 items-center text-sm">{lockDisplay}</p>
                <p className="text-xs text-muted-foreground">{grandFinaleDeadlineCopy}</p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="bonusPicksPointsPerCorrect">Points per Correctly-Placed Couple</Label>
                <Input
                  id="bonusPicksPointsPerCorrect"
                  type="number"
                  min={0}
                  value={bonusPicksPointsPerCorrect}
                  onChange={(e) => {
                    setPointsPerCorrectEdited(true);
                    setBonusPicksPointsPerCorrect(Number(e.target.value));
                  }}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="bonusMethod">Scoring Method</Label>
                <Select
                  items={METHOD_ITEMS}
                  value={bonusMethod}
                  onValueChange={(v) => changeBonusMethod((v as ScoringMethod) ?? GRAND_FINALE_DEFAULT_METHOD)}
                >
                  <SelectTrigger id="bonusMethod" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(METHOD_ITEMS) as ScoringMethod[]).map((m) => (
                      <SelectItem key={m} value={m}>
                        {METHOD_ITEMS[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {bonusMethod === "distance_based" && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="bonusDistancePenalty">Points Lost per Spot Off</Label>
                  <Input
                    id="bonusDistancePenalty"
                    type="number"
                    min={0}
                    value={bonusDistancePenalty}
                    onChange={(e) => setBonusDistancePenalty(Number(e.target.value))}
                  />
                </div>
              )}
              {bonusMethod === "band_tier" && (
                <>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="bonusTierSize">Couples per Band</Label>
                    <Input
                      id="bonusTierSize"
                      type="number"
                      min={1}
                      max={totalCouples}
                      value={bonusTierSize}
                      onChange={(e) =>
                        setBonusTierSize(Math.min(totalCouples, Math.max(1, Math.round(Number(e.target.value)))))
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="bonusTierPayStyle">Band Pay</Label>
                    <Select
                      items={TIER_PAY_STYLE_ITEMS}
                      value={bonusTierPayStyle}
                      onValueChange={(v) => changeTierPayStyle((v as TierPayStyle) ?? GRAND_FINALE_DEFAULT_TIER_PAY_STYLE)}
                    >
                      <SelectTrigger id="bonusTierPayStyle" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(TIER_PAY_STYLE_ITEMS) as TierPayStyle[]).map((style) => (
                          <SelectItem key={style} value={style}>
                            {TIER_PAY_STYLE_ITEMS[style]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{explainMethod()}</p>

            <div className="border-t border-border pt-4">
              <p className="pb-2 text-sm font-medium">Placement Bonus</p>
              <p className="pb-4 text-sm text-muted-foreground">
                A separate bonus for a rostered couple actually finishing in the top 5 — on top of the
                full-order prediction above, and on top of Dance Card&apos;s own placement bonus.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="bonusPicksFirstPlacePoints">1st Place Bonus</Label>
                  <Input
                    id="bonusPicksFirstPlacePoints"
                    type="number"
                    min={0}
                    value={bonusPicksFirstPlacePoints}
                    onChange={(e) => setBonusPicksFirstPlacePoints(Number(e.target.value))}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="bonusPicksSecondPlacePoints">2nd Place Bonus</Label>
                  <Input
                    id="bonusPicksSecondPlacePoints"
                    type="number"
                    min={0}
                    value={bonusPicksSecondPlacePoints}
                    onChange={(e) => setBonusPicksSecondPlacePoints(Number(e.target.value))}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="bonusPicksThirdPlacePoints">3rd Place Bonus</Label>
                  <Input
                    id="bonusPicksThirdPlacePoints"
                    type="number"
                    min={0}
                    value={bonusPicksThirdPlacePoints}
                    onChange={(e) => setBonusPicksThirdPlacePoints(Number(e.target.value))}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="bonusPicksFourthPlacePoints">4th Place Bonus</Label>
                  <Input
                    id="bonusPicksFourthPlacePoints"
                    type="number"
                    min={0}
                    value={bonusPicksFourthPlacePoints}
                    onChange={(e) => setBonusPicksFourthPlacePoints(Number(e.target.value))}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="bonusPicksFifthPlacePoints">5th Place Bonus</Label>
                  <Input
                    id="bonusPicksFifthPlacePoints"
                    type="number"
                    min={0}
                    value={bonusPicksFifthPlacePoints}
                    onChange={(e) => setBonusPicksFifthPlacePoints(Number(e.target.value))}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <BottomNav>
        <div className="flex flex-col gap-2 py-3">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && (
            <p
              role="status"
              className="flex items-center gap-2 rounded-md bg-emerald/20 px-3 py-2 text-sm font-medium text-emerald-text"
            >
              <span aria-hidden>✓</span>
              Settings saved
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => handleSave()} disabled={submitting || syncingAnchor}>
              {submitting ? "Saving..." : "Save"}
            </Button>
            <Button variant="outline" onClick={() => handleSave(true)} disabled={submitting || syncingAnchor}>
              Save &amp; Exit
            </Button>
          </div>
        </div>
      </BottomNav>
    </div>
  );
}
