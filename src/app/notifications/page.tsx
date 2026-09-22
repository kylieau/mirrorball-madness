import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TopBar } from "@/components/top-bar";
import { computeLeagueSummary } from "@/lib/league-summary";
import { groupEpisodesByWeek, liveCompetitionWeek } from "@/lib/competition-week";
import { getAccountSettingsData } from "@/lib/account-settings-data";

export default async function NotificationsPage() {
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
      .select("leagues(id, name)")
      .or(`user_id.eq.${user.id},co_manager_id.eq.${user.id}`),
    getAccountSettingsData(supabase, user.id),
  ]);

  const leagues = (memberships ?? []).map((m) => m.leagues!).filter(Boolean);

  const { data: activeSeasonId } = await supabase.rpc("active_season_id");
  const [{ data: weekRows }, { data: episodeRows }] = await Promise.all([
    supabase
      .from("competition_weeks")
      .select("id, week_number, theme, is_elimination_week, is_double_elimination_week, is_finale")
      .eq("season_id", activeSeasonId ?? ""),
    supabase
      .from("episodes")
      .select("id, episode_number, week_id, airs_at, theme, status")
      .eq("season_id", activeSeasonId ?? ""),
  ]);
  const liveWeek = liveCompetitionWeek(groupEpisodesByWeek(weekRows ?? [], episodeRows ?? []));
  const upcomingEpisode = liveWeek ? { id: liveWeek.id, week_number: liveWeek.week_number } : null;

  const summaries = await Promise.all(
    leagues.map((league) => computeLeagueSummary(supabase, user.id, league, upcomingEpisode ?? null))
  );

  const needingAttention = summaries.filter((s) => s.needsAttention);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
      <TopBar {...accountSettingsData} email={user.email ?? ""} />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          In-app only for now — email/push delivery isn&apos;t built yet.
        </p>
      </div>

      {needingAttention.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>You&apos;re all caught up</CardTitle>
            <CardDescription>Nothing needs your attention right now.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {needingAttention.map((s) => (
            <Link key={s.id} href={`/leagues/${s.id}`}>
              <Card className="transition-colors hover:bg-muted">
                <CardContent className="flex items-center justify-between gap-3 py-4">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{s.name}</span>
                    <span className="text-xs text-muted-foreground">{s.statusText}</span>
                  </div>
                  <span className="size-2 shrink-0 rounded-full bg-destructive" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
