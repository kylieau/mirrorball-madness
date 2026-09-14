import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { WeeklyResultsView } from "@/components/weekly-results-view";
import { buildCoupleDisplayNames } from "@/lib/couple-display";
import { HomeIcon, ListChecksIcon, PencilLineIcon, SettingsIcon, TrophyIcon } from "lucide-react";

const TAB_ITEM_CLASSES =
  "flex flex-1 flex-col items-center gap-0.5 rounded-md px-2 py-1.5 text-sm font-medium sm:flex-row sm:gap-1.5 sm:px-3";

export default async function ThisWeekPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: memberships }, { data: profile }] = await Promise.all([
    supabase
      .from("league_members")
      .select("joined_at, leagues(id, name)")
      .eq("user_id", user.id)
      .order("joined_at", { ascending: true }),
    supabase.from("profiles").select("display_name").eq("id", user.id).single(),
  ]);

  const leagueRefs = (memberships ?? []).map((m) => m.leagues!).filter(Boolean);

  if (leagueRefs.length === 0) {
    redirect("/leagues");
  }

  const firstLeagueId = leagueRefs[0].id;
  const leagueIds = leagueRefs.map((l) => l.id);
  const leagueNameById = new Map(leagueRefs.map((l) => [l.id, l.name]));

  const { data: activeSeasonId } = await supabase.rpc("active_season_id");
  const { data: completedEpisodes } = await supabase
    .from("episodes")
    .select("id, week_number, airs_at, theme, is_finale")
    .eq("season_id", activeSeasonId ?? "")
    .eq("status", "completed")
    .order("week_number", { ascending: false })
    .limit(1);
  const latestEpisodeId = completedEpisodes?.[0]?.id ?? null;

  const [{ data: danceScores }, { data: episodeResults }, { data: danceStyles }, { data: allCouples }] =
    await Promise.all([
      latestEpisodeId
        ? supabase.from("dance_scores").select("id, episode_id, couple_id, dance_style_id, total_score").eq("episode_id", latestEpisodeId)
        : Promise.resolve({ data: [] }),
      latestEpisodeId
        ? supabase
            .from("episode_results")
            .select("episode_id, couple_id, outcome, was_bottom_two, was_bottom_three")
            .eq("episode_id", latestEpisodeId)
        : Promise.resolve({ data: [] }),
      supabase.from("dance_styles").select("id, name").order("name"),
      supabase
        .from("couples")
        .select("id, celebrity:people!couples_celebrity_id_fkey(name), pro:people!couples_pro_id_fkey(name)"),
    ]);

  const flatCouples = (allCouples ?? []).map((c) => ({
    id: c.id,
    celebrity_name: c.celebrity?.name ?? "Unknown",
    pro_name: c.pro?.name ?? "Unknown",
  }));
  const coupleDisplayNames = buildCoupleDisplayNames(flatCouples);

  // Which of the viewer's own leagues have each couple on their Dance Card
  // roster right now, plus which leagues they picked this couple as this
  // week's elimination/top-scorer call — this is what makes eliminations
  // and safe calls read as personally relevant instead of just generic
  // show news. Picks are looked up against the episode being shown here
  // (the latest completed one), not the upcoming episode Your Picks deals
  // with — a past call, not a pending one.
  const [{ data: rosterSlots }, { data: pastPredictions }] = await Promise.all([
    supabase
      .from("roster_slots")
      .select("league_id, couple_id")
      .eq("manager_id", user.id)
      .in("league_id", leagueIds)
      .is("end_week", null),
    latestEpisodeId
      ? supabase
          .from("predictions")
          .select("league_id, predicted_eliminated_couple_id, predicted_top_scorer_couple_id")
          .eq("manager_id", user.id)
          .eq("episode_id", latestEpisodeId)
          .in("league_id", leagueIds)
      : Promise.resolve({ data: [] }),
  ]);

  const rosterLeaguesByCouple: Record<string, string[]> = {};
  for (const slot of rosterSlots ?? []) {
    if (!slot.couple_id) continue;
    const leagueName = leagueNameById.get(slot.league_id);
    if (!leagueName) continue;
    (rosterLeaguesByCouple[slot.couple_id] ??= []).push(leagueName);
  }

  const eliminationPickLeaguesByCouple: Record<string, string[]> = {};
  const topScorerPickLeaguesByCouple: Record<string, string[]> = {};
  for (const p of pastPredictions ?? []) {
    const leagueName = leagueNameById.get(p.league_id);
    if (!leagueName) continue;
    if (p.predicted_eliminated_couple_id) {
      (eliminationPickLeaguesByCouple[p.predicted_eliminated_couple_id] ??= []).push(leagueName);
    }
    if (p.predicted_top_scorer_couple_id) {
      (topScorerPickLeaguesByCouple[p.predicted_top_scorer_couple_id] ??= []).push(leagueName);
    }
  }

  const leaguesByCouple: Record<string, string[]> = {};
  for (const coupleId of new Set([
    ...Object.keys(rosterLeaguesByCouple),
    ...Object.keys(eliminationPickLeaguesByCouple),
    ...Object.keys(topScorerPickLeaguesByCouple),
  ])) {
    const lines: string[] = [];
    if (rosterLeaguesByCouple[coupleId]?.length) {
      lines.push(`On your roster in ${rosterLeaguesByCouple[coupleId].join(", ")}`);
    }
    if (eliminationPickLeaguesByCouple[coupleId]?.length) {
      lines.push(`Your elimination pick in ${eliminationPickLeaguesByCouple[coupleId].join(", ")}`);
    }
    if (topScorerPickLeaguesByCouple[coupleId]?.length) {
      lines.push(`Your top-scorer pick in ${topScorerPickLeaguesByCouple[coupleId].join(", ")}`);
    }
    leaguesByCouple[coupleId] = lines;
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <Link href="/today" className="text-xs font-medium text-muted-foreground">
          🪩 Mirrorball Madness
        </Link>
        <div className="flex gap-2">
          <Button
            render={<Link href="/settings" />}
            nativeButton={false}
            variant="outline"
            size="icon-sm"
            aria-label="Settings"
          >
            <SettingsIcon />
          </Button>
          <Button
            render={<Link href="/settings" />}
            nativeButton={false}
            size="icon-sm"
            aria-label="Account settings"
            className="rounded-full font-bold"
          >
            {(profile?.display_name ?? "?").charAt(0).toUpperCase()}
          </Button>
        </div>
      </div>

      <div className="pb-20 sm:pb-0">
        <WeeklyResultsView
          episodes={completedEpisodes ?? []}
          episodeResults={episodeResults ?? []}
          danceScores={danceScores ?? []}
          danceStyles={danceStyles ?? []}
          couples={flatCouples}
          coupleDisplayNames={Object.fromEntries(coupleDisplayNames)}
          leaguesByCouple={leaguesByCouple}
        />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] sm:static sm:border-t-0 sm:border-b sm:pb-0">
        <div className="flex w-full justify-around p-1 sm:w-fit sm:justify-start sm:gap-1">
          <Link href="/today" className={`${TAB_ITEM_CLASSES} text-muted-foreground hover:text-foreground`}>
            <HomeIcon className="size-5 sm:size-4" />
            <span className="text-[10px] sm:text-sm">Home</span>
          </Link>
          <span className={`${TAB_ITEM_CLASSES} text-accent`}>
            <ListChecksIcon className="size-5 sm:size-4" />
            <span className="text-[10px] sm:text-sm">This week</span>
          </span>
          <Link href={`/leagues/${firstLeagueId}?tab=yourpicks`} className={`${TAB_ITEM_CLASSES} text-muted-foreground hover:text-foreground`}>
            <PencilLineIcon className="size-5 sm:size-4" />
            <span className="text-[10px] sm:text-sm">Your picks</span>
          </Link>
          <Link href={`/leagues/${firstLeagueId}?tab=standings`} className={`${TAB_ITEM_CLASSES} text-muted-foreground hover:text-foreground`}>
            <TrophyIcon className="size-5 sm:size-4" />
            <span className="text-[10px] sm:text-sm">Standings</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
