import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { LeagueMembersSection, type LateGrandFinaleControls } from "@/components/league-members-section";
import { LeagueInfoSection } from "@/components/league-info-section";
import { LeagueModulesForm } from "@/components/league-modules-form";
import { LeaveLeagueButton } from "@/components/leave-league-button";
import { groupEpisodesByWeek } from "@/lib/competition-week";
import { safeRelativePath } from "@/lib/safe-relative-path";
import { findOwnMembership } from "@/lib/acting-manager";
import { resolvedCoupleCount } from "@/lib/grand-finale-late";
import { XIcon } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

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

  const [{ data: league }, { data: scoringSettings }, { data: members }, { data: profile }] = await Promise.all([
    supabase.from("leagues").select("*").eq("id", id).single(),
    supabase.from("scoring_settings").select("*").eq("league_id", id).single(),
    supabase
      .from("league_members")
      .select(
        "user_id, role, co_manager_id, co_manager_invite_code, profiles!league_members_user_id_fkey(display_name), co_manager:profiles!league_members_co_manager_id_fkey(display_name)"
      )
      .eq("league_id", id)
      .order("joined_at"),
    supabase.from("profiles").select("is_super_admin").eq("id", user.id).maybeSingle(),
  ]);
  const isSuperAdmin = profile?.is_super_admin ?? false;
  const closeHref = safeRelativePath(from, `/leagues/${id}?tab=yourpicks`);

  // A non-member sees no league row (RLS). A super admin can still open
  // this page to allow a late Grand Finale in a league they don't belong to.
  if (!league) {
    if (isSuperAdmin) return <SuperAdminManagers leagueId={id} closeHref={closeHref} />;
    notFound();
  }

  // Not a league member at all — is_league_member-scoped RLS would already
  // return nothing above, but members is checked explicitly here for a
  // clear redirect rather than rendering a settings page for no one's data.
  const viewerMembership = findOwnMembership(members ?? [], user.id);
  if (!viewerMembership) {
    if (isSuperAdmin) return <SuperAdminManagers leagueId={id} closeHref={closeHref} />;
    redirect("/leagues");
  }

  const isCommissioner = viewerMembership.role === "commissioner";

  const { data: activeSeasonId } = await supabase.rpc("active_season_id");
  const [
    { data: weekRows },
    { data: episodeRows },
    { data: activeSeason },
    { data: effectiveHardDeadlineWeek },
    { data: effectiveGrandFinaleDeadline },
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
      supabase.rpc("effective_grand_finale_deadline", { p_league_id: id }),
      supabase
        .from("couples")
        .select("id", { count: "exact", head: true })
        .eq("season_id", activeSeasonId ?? ""),
    ]);
  // Same trigger update_scoring_categories enforces server-side — this is
  // just a UI hint to avoid a confusing failed-save, not the source of
  // truth. Computed here (real request-time "now", not a client re-guess)
  // so no client-side date hydration dance is needed for a plain boolean.
  const scoringLocked =
    !(scoringSettings?.locking_exempt ?? false) &&
    effectiveGrandFinaleDeadline != null &&
    new Date(effectiveGrandFinaleDeadline).getTime() <= Date.now();
  const seasonNumber = activeSeason?.season_number ?? null;
  const groupedWeeks = groupEpisodesByWeek(weekRows ?? [], episodeRows ?? []);
  const seasonEpisodes = groupedWeeks.map((week) => ({
    week_number: week.week_number,
    theme: week.theme,
    airs_at: week.earliestAirsAt ?? "",
  }));

  const grandFinaleLocked =
    (scoringSettings?.bonus_picks_category_enabled ?? false) &&
    effectiveGrandFinaleDeadline != null &&
    new Date(effectiveGrandFinaleDeadline).getTime() <= Date.now();
  const lateGrandFinale = grandFinaleLocked
    ? await loadLateGrandFinale(supabase, id, activeSeasonId, isCommissioner || isSuperAdmin)
    : null;

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
              hasGrandFinaleBracket: lateGrandFinale?.bracketManagerIds.has(m.user_id) ?? false,
              lateUnlock: lateGrandFinale?.unlockByManager.get(m.user_id) ?? null,
            };
          })}
          canEdit={isCommissioner}
          lateGrandFinale={lateGrandFinale?.controls ?? null}
        />
        <LeagueInfoSection
          leagueId={id}
          leagueName={league.name}
          inviteCode={league.invite_code}
          canEdit={isCommissioner}
          canResetDraft={
            (scoringSettings?.judges_score_category_enabled ?? true) && league.draft_status !== "not_started"
          }
        >
          <LeaveLeagueButton
            leagueId={id}
            leagueName={league.name}
            isCommissioner={isCommissioner}
            isCoManager={viewerMembership.user_id !== user.id}
            hasCoManager={viewerMembership.user_id === user.id && viewerMembership.co_manager_id !== null}
            teamUserId={viewerMembership.user_id}
          />
        </LeagueInfoSection>
        <LeagueModulesForm
          leagueId={id}
          league={league}
          scoringSettings={scoringSettings}
          canEdit={isCommissioner}
          seasonEpisodes={seasonEpisodes ?? []}
          seasonNumber={seasonNumber}
          effectiveHardDeadlineWeek={effectiveHardDeadlineWeek ?? null}
          scoringLocked={scoringLocked}
          totalCouples={totalCouples ?? 12}
          exitHref={closeHref}
        />
      </div>
    </div>
  );
}

async function loadLateGrandFinale(
  supabase: SupabaseClient<Database>,
  leagueId: string,
  seasonId: string | null,
  canUnlock: boolean
) {
  const [{ data: coupleRows }, { data: bracketRows }, { data: unlockRows }] = await Promise.all([
    supabase.from("couples").select("status").eq("season_id", seasonId ?? ""),
    supabase.from("grand_finale_predictions").select("manager_id").eq("league_id", leagueId),
    supabase
      .from("grand_finale_late_unlocks")
      .select("manager_id, late_factor, submitted_at")
      .eq("league_id", leagueId),
  ]);
  const controls: LateGrandFinaleControls = {
    canUnlock,
    resolvedCount: resolvedCoupleCount((coupleRows ?? []).map((row) => row.status)),
  };
  return {
    controls,
    bracketManagerIds: new Set((bracketRows ?? []).map((row) => row.manager_id)),
    unlockByManager: new Map(
      (unlockRows ?? []).map((row) => [
        row.manager_id,
        { lateFactor: Number(row.late_factor), submitted: row.submitted_at != null },
      ])
    ),
  };
}

// Caller has already verified profiles.is_super_admin. The user-scoped client
// can't see a league they aren't in, so this read uses the service role.
async function SuperAdminManagers({ leagueId, closeHref }: { leagueId: string; closeHref: string }) {
  const admin = createAdminClient();
  const { data: league } = await admin.from("leagues").select("name").eq("id", leagueId).maybeSingle();
  if (!league) notFound();

  const [{ data: settings }, { data: deadline }, { data: seasonId }, { data: members }] = await Promise.all([
    admin.from("scoring_settings").select("bonus_picks_category_enabled").eq("league_id", leagueId).maybeSingle(),
    admin.rpc("effective_grand_finale_deadline", { p_league_id: leagueId }),
    admin.rpc("active_season_id"),
    admin
      .from("league_members")
      .select(
        "user_id, role, co_manager_id, profiles!league_members_user_id_fkey(display_name), co_manager:profiles!league_members_co_manager_id_fkey(display_name)"
      )
      .eq("league_id", leagueId)
      .order("joined_at"),
  ]);
  const grandFinaleLocked =
    (settings?.bonus_picks_category_enabled ?? false) &&
    deadline != null &&
    new Date(deadline).getTime() <= Date.now();
  const late = grandFinaleLocked ? await loadLateGrandFinale(admin, leagueId, seasonId, true) : null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pb-8">
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
          leagueId={leagueId}
          canEdit={false}
          lateGrandFinale={late?.controls ?? null}
          members={(members ?? []).map((m) => ({
            userId: m.user_id,
            displayName: m.profiles?.display_name ?? "Unknown",
            role: m.role,
            coManagerId: m.co_manager_id,
            coManagerDisplayName: m.co_manager?.display_name ?? null,
            isOwnRow: false,
            inviteCode: null,
            hasGrandFinaleBracket: late?.bracketManagerIds.has(m.user_id) ?? false,
            lateUnlock: late?.unlockByManager.get(m.user_id) ?? null,
          }))}
        />
      </div>
    </div>
  );
}
