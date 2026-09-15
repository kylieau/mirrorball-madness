import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HomeDashboard } from "@/components/home-dashboard";
import { PageHeader } from "@/components/page-header";
import { TopBar } from "@/components/top-bar";
import { computeLeagueHomeSummary } from "@/lib/league-home-summary";
import { getAccountSettingsData } from "@/lib/account-settings-data";
import { buildCoupleDisplayNames, formatCoupleName } from "@/lib/couple-display";
import { HomeIcon, ListChecksIcon, PencilLineIcon, TrophyIcon } from "lucide-react";

const TAB_ITEM_CLASSES =
  "flex flex-1 flex-col items-center gap-0.5 rounded-md px-2 py-1.5 text-sm font-medium sm:flex-row sm:gap-1.5 sm:px-3";

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: memberships }, accountSettingsData] = await Promise.all([
    supabase
      .from("league_members")
      .select("joined_at, leagues(id, name)")
      .eq("user_id", user.id)
      .order("joined_at", { ascending: true }),
    getAccountSettingsData(supabase, user.id),
  ]);

  const leagueRefs = (memberships ?? []).map((m) => m.leagues!).filter(Boolean);

  if (leagueRefs.length === 0) {
    redirect("/leagues");
  }

  const firstLeagueId = leagueRefs[0].id;

  const { data: upcomingEpisode } = await supabase
    .from("episodes")
    .select("id, week_number")
    .eq("status", "upcoming")
    .order("week_number", { ascending: true })
    .order("week_part", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: activeSeasonId } = await supabase.rpc("active_season_id");
  const { data: completedEpisodes } = await supabase
    .from("episodes")
    .select("id")
    .eq("season_id", activeSeasonId ?? "")
    .eq("status", "completed")
    .order("week_number", { ascending: false })
    .order("week_part", { ascending: false })
    .limit(1);
  const latestCompletedEpisodeId = completedEpisodes?.[0]?.id ?? null;

  const RECENT_JOIN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
  const joinCutoffMs = Date.now() - RECENT_JOIN_WINDOW_MS;

  const summaries = await Promise.all(
    leagueRefs.map((league) =>
      computeLeagueHomeSummary(supabase, user.id, league, upcomingEpisode ?? null, latestCompletedEpisodeId, joinCutoffMs)
    )
  );

  // Eliminations are season-global, so this only needs fetching once and
  // applies the same to every Dance-Card league the couple's manager is in.
  let latestEliminatedNames: string[] = [];
  if (latestCompletedEpisodeId) {
    const [{ data: episodeResults }, { data: couples }] = await Promise.all([
      supabase.from("episode_results").select("couple_id, outcome").eq("episode_id", latestCompletedEpisodeId),
      supabase
        .from("couples")
        .select("id, celebrity:people!couples_celebrity_id_fkey(name), pro:people!couples_pro_id_fkey(name)"),
    ]);
    const displayNames = buildCoupleDisplayNames(
      (couples ?? []).map((c) => ({
        id: c.id,
        celebrity_name: c.celebrity?.name ?? "Unknown",
        pro_name: c.pro?.name ?? "Unknown",
      }))
    );
    latestEliminatedNames = (episodeResults ?? [])
      .filter((r) => r.outcome === "eliminated")
      .map((r) => displayNames.get(r.couple_id))
      .filter((parts): parts is NonNullable<typeof parts> => !!parts)
      .map((parts) => formatCoupleName(parts));
  }

  const leagues = summaries.map((s) => ({
    id: s.id,
    name: s.name,
    rank: s.rank,
    totalMembers: s.totalMembers,
    totalPoints: s.totalPoints,
    picksDue: s.picksDue,
    danceCardOn: s.danceCardOn,
    curtainCallOn: s.curtainCallOn,
    grandFinaleOn: s.grandFinaleOn,
  }));

  const deadlines = summaries
    .filter((s) => s.picksDue && s.nextDeadline)
    .map((s) => ({ leagueId: s.id, leagueName: s.name, moduleLabel: s.nextDeadline!.label, iso: s.nextDeadline!.iso }))
    .sort((a, b) => new Date(a.iso).getTime() - new Date(b.iso).getTime());

  const recentActivity = [
    ...summaries.flatMap((s) =>
      s.danceCardOn ? latestEliminatedNames.map((name) => `${name} eliminated — ${s.name}`) : []
    ),
    ...summaries.filter((s) => s.tookLead).map((s) => `${s.name}: you took the points lead`),
    ...summaries
      .flatMap((s) => s.recentJoins.map((j) => ({ ...j, leagueName: s.name })))
      .sort((a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime())
      .map((j) => `${j.name} joined ${j.leagueName}`),
  ].slice(0, 3);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
      <TopBar {...accountSettingsData} email={user.email ?? ""} />

      <div className="pb-20 sm:pb-0">
        <PageHeader title="Home" />
        <HomeDashboard leagues={leagues} deadlines={deadlines} recentActivity={recentActivity} />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] sm:static sm:border-t-0 sm:border-b sm:pb-0">
        <div className="flex w-full justify-around p-1 sm:w-fit sm:justify-start sm:gap-1">
          <span className={`${TAB_ITEM_CLASSES} text-accent`}>
            <HomeIcon className="size-5 sm:size-4" />
            <span className="text-[10px] sm:text-sm">Home</span>
          </span>
          <Link href="/this-week" className={`${TAB_ITEM_CLASSES} text-muted-foreground hover:text-foreground`}>
            <ListChecksIcon className="size-5 sm:size-4" />
            <span className="text-[10px] sm:text-sm">This Week</span>
          </Link>
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
