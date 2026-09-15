import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DraftRoom } from "@/components/draft-room";
import { buildCoupleDisplayNames } from "@/lib/couple-display";
import { safeRelativePath } from "@/lib/safe-relative-path";
import { XIcon } from "lucide-react";

export default async function DraftPage({
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

  const { data: league } = await supabase
    .from("leagues")
    .select("*")
    .eq("id", id)
    .single();

  if (!league) {
    notFound();
  }

  const closeHref = safeRelativePath(from, `/leagues/${id}?tab=yourpicks`);

  const { data: scoringSettings } = await supabase
    .from("scoring_settings")
    .select("judges_score_category_enabled")
    .eq("league_id", id)
    .single();

  if (scoringSettings && !scoringSettings.judges_score_category_enabled) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <Link
          href={closeHref}
          aria-label="Close"
          className="self-start text-muted-foreground hover:text-foreground"
        >
          <XIcon className="size-5" />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Dance Card isn&apos;t enabled</h1>
        <p className="text-sm text-muted-foreground">
          This league isn&apos;t running the draft/roster module — the commissioner
          can turn Dance Card on in league settings.
        </p>
      </div>
    );
  }

  const { data: activeSeasonId } = await supabase.rpc("active_season_id");

  const [{ data: members }, { data: couples }, { data: picks }] = await Promise.all([
    supabase
      .from("league_members")
      .select("user_id, role, draft_position, profiles(display_name)")
      .eq("league_id", id)
      .order("draft_position"),
    supabase
      .from("couples")
      .select(
        "id, celebrity:people!couples_celebrity_id_fkey(name), pro:people!couples_pro_id_fkey(name)"
      )
      .eq("season_id", activeSeasonId ?? ""),
    supabase
      .from("draft_picks")
      .select("id, couple_id, manager_id, round, pick_number, picked_at")
      .eq("league_id", id)
      .order("pick_number"),
  ]);

  const flatCouples = (couples ?? [])
    .map((c) => ({
      id: c.id,
      celebrity_name: c.celebrity?.name ?? "Unknown",
      pro_name: c.pro?.name ?? "Unknown",
    }))
    .sort((a, b) => a.celebrity_name.localeCompare(b.celebrity_name));

  const coupleDisplayNames = Object.fromEntries(buildCoupleDisplayNames(flatCouples));

  return (
    <DraftRoom
      league={league}
      members={members ?? []}
      couples={flatCouples}
      coupleDisplayNames={coupleDisplayNames}
      initialPicks={picks ?? []}
      currentUserId={user.id}
      closeHref={closeHref}
    />
  );
}
