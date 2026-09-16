import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LeagueMembersSection } from "@/components/league-members-section";
import { LeagueInfoSection } from "@/components/league-info-section";
import { LeagueModulesForm } from "@/components/league-modules-form";
import { safeRelativePath } from "@/lib/safe-relative-path";
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
      .select("user_id, role, profiles(display_name)")
      .eq("league_id", id)
      .order("joined_at"),
  ]);

  if (!league) {
    notFound();
  }

  // Not a league member at all — is_league_member-scoped RLS would already
  // return nothing above, but members is checked explicitly here for a
  // clear redirect rather than rendering a settings page for no one's data.
  const viewerMembership = (members ?? []).find((m) => m.user_id === user.id);
  if (!viewerMembership) {
    redirect("/leagues");
  }

  const isCommissioner = viewerMembership.role === "commissioner";

  const { data: activeSeasonId } = await supabase.rpc("active_season_id");
  const [{ data: seasonEpisodes }, { data: activeSeason }, { data: hardDeadlineAirsAt }] = await Promise.all([
    supabase
      .from("episodes")
      .select("week_number, theme")
      .eq("season_id", activeSeasonId ?? "")
      .order("week_number"),
    supabase.from("seasons").select("season_number").eq("id", activeSeasonId ?? "").maybeSingle(),
    supabase.rpc("effective_grand_finale_deadline", { p_league_id: id }),
  ]);
  const seasonNumber = activeSeason?.season_number ?? null;

  const closeHref = safeRelativePath(from, `/leagues/${id}?tab=yourpicks`);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
      <div className="flex flex-col gap-6">
        <Link href={closeHref} aria-label="Close" className="text-muted-foreground hover:text-foreground">
          <XIcon className="size-5" />
        </Link>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">League Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">{league.name}</p>
        </div>

        <LeagueMembersSection
          leagueId={id}
          members={(members ?? []).map((m) => ({
            userId: m.user_id,
            displayName: m.profiles?.display_name ?? "Unknown",
            role: m.role,
          }))}
          canEdit={isCommissioner}
        />
        <LeagueInfoSection
          leagueId={id}
          leagueName={league.name}
          inviteCode={league.invite_code}
          canEdit={isCommissioner}
        />
        <LeagueModulesForm
          leagueId={id}
          league={league}
          scoringSettings={scoringSettings}
          canEdit={isCommissioner}
          seasonEpisodes={seasonEpisodes ?? []}
          seasonNumber={seasonNumber}
          hardDeadlineAirsAt={hardDeadlineAirsAt ?? null}
        />
      </div>
    </div>
  );
}
