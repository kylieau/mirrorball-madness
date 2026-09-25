import Link from "next/link";
import { cn } from "cn";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateJoinLeagueDialogs } from "@/components/create-join-league-dialogs";
import { LeagueTriageCard, type LeagueTriage } from "@/components/league-triage-card";
import { TopBar } from "@/components/top-bar";
import { getAccountSettingsData } from "@/lib/account-settings-data";
import type { ModuleStackInput } from "@/lib/league-triage";
import { loadHomeLeagueData } from "@/lib/home-league-data";
import { loadModuleStackInputs } from "@/lib/league-module-stack-data";

export default async function LeaguesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
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
      .select("role, leagues(id, name)")
      .or(`user_id.eq.${user.id},co_manager_id.eq.${user.id}`)
      .order("joined_at", { ascending: true }),
    getAccountSettingsData(supabase, user.id),
  ]);

  const rows = (memberships ?? []).filter((m) => m.leagues);
  const { summaries, weeksBehind, liveWeekNumber, cutoff, activeSeasonId, finaleWeekNumber } = await loadHomeLeagueData(
    supabase,
    user.id,
    accountSettingsData.spoilerFreeMode,
    rows.map((m) => m.leagues!)
  );
  const moduleInputs = summaries.length > 0 ? await loadModuleStackInputs(supabase, summaries, {
          activeSeasonId,
          spoilerCutoffWeek: cutoff.effectiveLatestEpisode?.week_number ?? null,
          finaleWeekNumber,
        }) : new Map<string, ModuleStackInput>();
  const leagues: LeagueTriage[] = summaries
    .map((s, i) => ({
      id: s.id,
      name: s.name,
      isCommissioner: rows[i].role === "commissioner",
      rank: s.rank,
      totalMembers: s.totalMembers,
      totalPoints: s.totalPoints,
      picksDue: s.picksDue,
      weeksBehind,
      modules: moduleInputs.get(s.id)!,
    }))
    .sort((a, b) => Number(b.picksDue) - Number(a.picksDue));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
      <div className="flex flex-col gap-6">
        <TopBar {...accountSettingsData} email={user.email ?? ""} />

        {leagues.length > 0 && (
          <Link href="/today" className="text-sm font-medium text-muted-foreground">
            ‹ Back
          </Link>
        )}

        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="whitespace-nowrap text-2xl font-semibold tracking-tight">Manage Leagues</h1>
            {liveWeekNumber !== null && (
              <p className={cn("mt-1 text-sm font-semibold text-accent", weeksBehind > 0 && "invisible")}>
                Week {liveWeekNumber}
              </p>
            )}
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          </div>
          <CreateJoinLeagueDialogs stacked />
        </div>

        {leagues.length > 0 ? (
          <div className="flex flex-col gap-2.5">
            {leagues.map((league) => (
              <LeagueTriageCard key={league.id} league={league} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            You haven&apos;t joined a league yet — create one or join with an invite code above.
          </p>
        )}
      </div>
    </div>
  );
}
