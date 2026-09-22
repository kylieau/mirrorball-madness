import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LeagueMembersSection } from "@/components/league-members-section";
import { LeagueInfoSection } from "@/components/league-info-section";
import { LeagueModulesForm } from "@/components/league-modules-form";
import { groupEpisodesByWeek } from "@/lib/competition-week";
import { safeRelativePath } from "@/lib/safe-relative-path";
import { findOwnMembership } from "@/lib/acting-manager";
import { XIcon } from "lucide-react";

export default async function LeagueSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: league }, { data: scoringSettings }, { data: members }] = await Promise.all([
    supabase.from("leagues").select("*").eq("id", id).single(),
    supabase.from("scoring_settings").select("*").eq("league_id", id).single(),
    supabase
      .from("league_members")
      .select(
        "user_id, role, co_manager_id, co_manager_invite_code, profiles!league_members_user_id_fkey(display_name), co_manager:profiles!league_members_co_manager_id_fkey(display_name)"
      )
      .eq("league_id", id)
      .order("joined_at"),
  ]);

  if (!league) {
    notFound();
  }

  // Not a league member at all — is_league_member-scoped RLS would already
  // return nothing above, but members is checked explicitly here for a
  // clear redirect rather than rendering a settings page for no one's data.
  const viewerMembership = findOwnMembership(members ?? [], user.id);
  if (!viewerMembership) {
    redirect("/leagues");
  }

  const isCommissioner = viewerMembership.role === "commissioner";

  const { data: activeSeasonId } = await supabase.rpc("active_season_id");
  const [
    { data: weekRows },
    { data: episodeRows },
    { data: activeSeason },
    { data: effectiveHardDeadlineWeek },
    { count: totalCouples },
  ] =
    await Promise.all([
      supabase
        .from("competition_weeks")
        .select("id, week_number, theme, is_elimination_week, is_double_elimination_week, is_finale")
        .eq("season_id", activeSeasonId ?? "")
        .order("week_number"),
      supabase
        .from("episodes")
        .select("id, episode_number, week_id, airs_at, theme, status")
        .eq("season_id", activeSeasonId ?? ""),
      supabase.from("seasons").select("season_number").eq("id", activeSeasonId ?? "").maybeSingle(),
      supabase.rpc("effective_hard_deadline_week", { p_league_id: id }),
      supabase
        .from("couples")
        .select("id", { count: "exact", head: true })
        .eq("season_id", activeSeasonId ?? ""),
    ]);
  const seasonNumber = activeSeason?.season_number ?? null;
  const groupedWeeks = groupEpisodesByWeek(weekRows ?? [], episodeRows ?? []);
  const seasonEpisodes = groupedWeeks.map((week) => ({
    week_number: week.week_number,
    theme: week.theme,
    airs_at: week.earliestAirsAt ?? "",
  }));

  const closeHref = safeRelativePath(from, `/leagues/${id}?tab=yourpicks`);

  return (
    <div
      className={`mx-auto flex max-w-2xl flex-col gap-4 px-4 ${
        // Room for the pinned Save bar so the last section isn't hidden behind it.
        isCommissioner ? "pb-36" : "pb-8"
      }`}
    >
      <div className="flex flex-col gap-6">
        <div className="sticky top-0 z-30 -mx-4 flex items-center justify-between gap-3 border-b border-border bg-background px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">League Settings</h1>
            <p className="mt-1 truncate text-sm text-muted-foreground">{league.name}</p>
          </div>
          <Link href={closeHref} aria-label="Close" className="shrink-0 text-muted-foreground hover:text-foreground">
            <XIcon className="size-5" />
          </Link>
        </div>

        <LeagueMembersSection
          leagueId={id}
          members={(members ?? []).map((m) => {
            const isOwnRow = m.user_id === user.id || m.co_manager_id === user.id;
            return {
              userId: m.user_id,
              displayName: m.profiles?.display_name ?? "Unknown",
              role: m.role,
              coManagerId: m.co_manager_id,
              coManagerDisplayName: m.co_manager?.display_name ?? null,
              isOwnRow,
              // Only the primary who owns this row ever sees its pending
              // invite code — anyone else in the league can already read
              // the row via RLS, but the code isn't theirs to use or leak.
              inviteCode: m.user_id === user.id ? m.co_manager_invite_code : null,
            };
          })}
          canEdit={isCommissioner}
        />
        <LeagueInfoSection
          leagueId={id}
          leagueName={league.name}
          inviteCode={league.invite_code}
          canEdit={isCommissioner}
          canResetDraft={
            (scoringSettings?.judges_score_category_enabled ?? true) && league.draft_status !== "not_started"
          }
        />
        <LeagueModulesForm
          leagueId={id}
          league={league}
          scoringSettings={scoringSettings}
          canEdit={isCommissioner}
          seasonEpisodes={seasonEpisodes ?? []}
          seasonNumber={seasonNumber}
          effectiveHardDeadlineWeek={effectiveHardDeadlineWeek ?? null}
          totalCouples={totalCouples ?? 12}
          exitHref={closeHref}
        />
      </div>
    </div>
  );
}
