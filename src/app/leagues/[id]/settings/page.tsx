import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { LeagueMembersSection } from "@/components/league-members-section";
import { LeagueInfoSection } from "@/components/league-info-section";
import { LeagueModulesForm } from "@/components/league-modules-form";
import type { GrandFinaleLateUnlockInput, LateMisser } from "@/components/grand-finale-late-unlock";
import { LeaveLeagueButton } from "@/components/leave-league-button";
import { groupEpisodesByWeek } from "@/lib/competition-week";
import { safeRelativePath } from "@/lib/safe-relative-path";
import { findOwnMembership } from "@/lib/acting-manager";
import { resolvedCoupleCount } from "@/lib/grand-finale-late";
import { formatManagerName } from "@/lib/manager-display";
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

  const season = await loadSeasonContext(supabase, id);
  // Same trigger update_scoring_categories enforces server-side — this is
  // just a UI hint to avoid a confusing failed-save, not the source of
  // truth. Computed here (real request-time "now", not a client re-guess)
  // so no client-side date hydration dance is needed for a plain boolean.
  const scoringLocked = scoringIsLocked(scoringSettings?.locking_exempt ?? false, season.effectiveGrandFinaleDeadline);
  const grandFinaleLocked =
    (scoringSettings?.bonus_picks_category_enabled ?? false) &&
    season.effectiveGrandFinaleDeadline != null &&
    new Date(season.effectiveGrandFinaleDeadline).getTime() <= Date.now();
  const lateGrandFinale = grandFinaleLocked ? await loadLateGrandFinale(supabase, id, season.activeSeasonId) : null;
  const memberRows = (members ?? []).map((m) => ({
    userId: m.user_id,
    displayName: m.profiles?.display_name ?? "Unknown",
    coManagerDisplayName: m.co_manager?.display_name ?? null,
  }));

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
          seasonEpisodes={season.seasonEpisodes}
          seasonNumber={season.seasonNumber}
          effectiveHardDeadlineWeek={season.effectiveHardDeadlineWeek}
          scoringLocked={scoringLocked}
          totalCouples={season.totalCouples}
          exitHref={closeHref}
          lateUnlock={buildLateUnlock(grandFinaleLocked, memberRows, lateGrandFinale, isCommissioner || isSuperAdmin)}
        />
      </div>
    </div>
  );
}

type LateGrandFinale = {
  resolvedCount: number;
  bracketManagerIds: Set<string>;
  unlockByManager: Map<string, { lateFactor: number; submitted: boolean }>;
};

function lockedManagerCount(memberIds: string[], late: LateGrandFinale | null) {
  if (!late) return 0;
  return memberIds.filter((id) => late.bracketManagerIds.has(id)).length;
}

function buildLateUnlock(
  grandFinaleLocked: boolean,
  members: { userId: string; displayName: string; coManagerDisplayName: string | null }[],
  late: LateGrandFinale | null,
  canUnlock: boolean
): GrandFinaleLateUnlockInput | null {
  if (!grandFinaleLocked || !late) return null;
  return {
    grandFinaleLocked: true,
    memberCount: members.length,
    lockedCount: lockedManagerCount(
      members.map((member) => member.userId),
      late
    ),
    canUnlock,
    resolvedCount: late.resolvedCount,
    missers: lateMissers(members, late),
  };
}

function scoringIsLocked(lockingExempt: boolean, deadline: string | null) {
  return !lockingExempt && deadline != null && new Date(deadline).getTime() <= Date.now();
}

async function loadSeasonContext(supabase: SupabaseClient<Database>, leagueId: string) {
  const { data: activeSeasonId } = await supabase.rpc("active_season_id");
  const [
    { data: weekRows },
    { data: episodeRows },
    { data: activeSeason },
    { data: effectiveHardDeadlineWeek },
    { data: effectiveGrandFinaleDeadline },
    { count: totalCouples },
  ] = await Promise.all([
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
    supabase.rpc("effective_hard_deadline_week", { p_league_id: leagueId }),
    supabase.rpc("effective_grand_finale_deadline", { p_league_id: leagueId }),
    supabase
      .from("couples")
      .select("id", { count: "exact", head: true })
      .eq("season_id", activeSeasonId ?? ""),
  ]);
  return {
    activeSeasonId,
    seasonNumber: activeSeason?.season_number ?? null,
    effectiveHardDeadlineWeek: effectiveHardDeadlineWeek ?? null,
    effectiveGrandFinaleDeadline,
    totalCouples: totalCouples ?? 12,
    seasonEpisodes: groupEpisodesByWeek(weekRows ?? [], episodeRows ?? []).map((week) => ({
      week_number: week.week_number,
      theme: week.theme,
      airs_at: week.earliestAirsAt ?? "",
    })),
  };
}

function lateMissers(
  members: { userId: string; displayName: string; coManagerDisplayName: string | null }[],
  late: LateGrandFinale | null
): LateMisser[] {
  if (!late) return [];
  return members
    .filter((member) => !late.bracketManagerIds.has(member.userId))
    .map((member) => ({
      userId: member.userId,
      displayName: formatManagerName(member),
      lateUnlock: late.unlockByManager.get(member.userId) ?? null,
    }));
}

async function loadLateGrandFinale(
  supabase: SupabaseClient<Database>,
  leagueId: string,
  seasonId: string | null
): Promise<LateGrandFinale> {
  const [{ data: coupleRows }, { data: bracketRows }, { data: unlockRows }] = await Promise.all([
    supabase.from("couples").select("status").eq("season_id", seasonId ?? ""),
    supabase.from("grand_finale_predictions").select("manager_id").eq("league_id", leagueId),
    supabase
      .from("grand_finale_late_unlocks")
      .select("manager_id, late_factor, submitted_at")
      .eq("league_id", leagueId),
  ]);
  return {
    resolvedCount: resolvedCoupleCount((coupleRows ?? []).map((row) => row.status)),
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
  const { data: league } = await admin.from("leagues").select("*").eq("id", leagueId).maybeSingle();
  if (!league) notFound();

  const [{ data: settings }, { data: members }, season] = await Promise.all([
    admin.from("scoring_settings").select("*").eq("league_id", leagueId).maybeSingle(),
    admin
      .from("league_members")
      .select(
        "user_id, role, co_manager_id, profiles!league_members_user_id_fkey(display_name), co_manager:profiles!league_members_co_manager_id_fkey(display_name)"
      )
      .eq("league_id", leagueId)
      .order("joined_at"),
    loadSeasonContext(admin, leagueId),
  ]);
  const grandFinaleLocked =
    (settings?.bonus_picks_category_enabled ?? false) &&
    season.effectiveGrandFinaleDeadline != null &&
    new Date(season.effectiveGrandFinaleDeadline).getTime() <= Date.now();
  const late = grandFinaleLocked ? await loadLateGrandFinale(admin, leagueId, season.activeSeasonId) : null;
  const memberRows = (members ?? []).map((m) => ({
    userId: m.user_id,
    displayName: m.profiles?.display_name ?? "Unknown",
    coManagerDisplayName: m.co_manager?.display_name ?? null,
  }));

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
          members={(members ?? []).map((m) => ({
            userId: m.user_id,
            displayName: m.profiles?.display_name ?? "Unknown",
            role: m.role,
            coManagerId: m.co_manager_id,
            coManagerDisplayName: m.co_manager?.display_name ?? null,
            isOwnRow: false,
            inviteCode: null,
          }))}
        />
        <LeagueModulesForm
          leagueId={leagueId}
          league={league}
          scoringSettings={settings}
          canEdit={false}
          seasonEpisodes={season.seasonEpisodes}
          seasonNumber={season.seasonNumber}
          effectiveHardDeadlineWeek={season.effectiveHardDeadlineWeek}
          scoringLocked={scoringIsLocked(settings?.locking_exempt ?? false, season.effectiveGrandFinaleDeadline)}
          totalCouples={season.totalCouples}
          exitHref={closeHref}
          lateUnlock={buildLateUnlock(grandFinaleLocked, memberRows, late, true)}
        />
      </div>
    </div>
  );
}
