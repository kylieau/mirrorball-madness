import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WaiversPanel } from "@/components/waivers-panel";
import { buildCoupleDisplayNames, formatCoupleName } from "@/lib/couple-display";
import { getAccountSettingsData } from "@/lib/account-settings-data";
import { partitionRecastSlots } from "@/lib/recast-framing";
import { resolveSpoilerCutoff } from "@/lib/spoiler-cutoff";
import { isSpoilerSafeActive } from "@/lib/spoiler-safe-couple-status";
import { safeRelativePath } from "@/lib/safe-relative-path";
import { XIcon } from "lucide-react";

export default async function WaiversPage({
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

  const [{ data: league }, { data: membership }] = await Promise.all([
    supabase
      .from("leagues")
      .select("id, name, waiver_mode, waiver_claim_method")
      .eq("id", id)
      .single(),
    supabase.from("league_members").select("role").eq("league_id", id).eq("user_id", user.id).maybeSingle(),
  ]);

  if (!league) {
    notFound();
  }

  const closeHref = safeRelativePath(from, `/leagues/${id}?tab=yourpicks`);
  const closeLink = (
    <Link
      href={closeHref}
      aria-label="Close"
      className="self-start text-muted-foreground hover:text-foreground"
    >
      <XIcon className="size-5" />
    </Link>
  );

  const { data: scoringSettings } = await supabase
    .from("scoring_settings")
    .select("judges_score_category_enabled")
    .eq("league_id", id)
    .single();

  if (scoringSettings && !scoringSettings.judges_score_category_enabled) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        {closeLink}
        <h1 className="text-2xl font-semibold tracking-tight">Dance Card isn&apos;t enabled</h1>
        <p className="text-sm text-muted-foreground">
          This league isn&apos;t running the draft/roster module — the commissioner
          can turn Dance Card on in league settings.
        </p>
      </div>
    );
  }

  if (league.waiver_mode !== "waivers") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        {closeLink}
        <h1 className="text-2xl font-semibold tracking-tight">Recast isn&apos;t enabled</h1>
        <p className="text-sm text-muted-foreground">
          This league&apos;s roster is locked — the commissioner can enable Recast in
          league settings.
        </p>
      </div>
    );
  }

  const { data: activeSeasonId } = await supabase.rpc("active_season_id");
  const accountSettingsData = await getAccountSettingsData(supabase, user.id);

  const coupleFields =
    "id, status, elimination_week, celebrity:people!couples_celebrity_id_fkey(name), pro:people!couples_pro_id_fkey(name)";

  const [
    { data: myRosterSlots },
    { data: allCouplesRaw },
    { data: rosteredSlots },
    { data: claims },
    { data: completedEpisodes },
    { data: finaleEpisode },
  ] = await Promise.all([
    supabase
      .from("roster_slots")
      .select(`slot_number, couples(${coupleFields})`)
      .eq("league_id", id)
      .eq("manager_id", user.id)
      .is("end_week", null),
    supabase.from("couples").select(coupleFields).eq("season_id", activeSeasonId ?? ""),
    supabase.from("roster_slots").select("couple_id").eq("league_id", id).is("end_week", null),
    supabase
      .from("waiver_claims")
      .select(`*, profiles(display_name), couples(${coupleFields})`)
      .eq("league_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("episodes")
      .select("id, week_number")
      .eq("season_id", activeSeasonId ?? "")
      .eq("status", "completed")
      .eq("is_scoring", true)
      .order("week_number", { ascending: false }),
    supabase
      .from("episodes")
      .select("week_number")
      .eq("season_id", activeSeasonId ?? "")
      .eq("is_finale", true)
      .maybeSingle(),
  ]);

  const cutoff = await resolveSpoilerCutoff(
    supabase,
    user.id,
    activeSeasonId ?? null,
    accountSettingsData.spoilerFreeMode,
    completedEpisodes ?? []
  );
  const cutoffWeek = cutoff.effectiveLatestEpisode?.week_number ?? null;
  const finaleWeekNumber = finaleEpisode?.week_number ?? null;

  const allCouples = (allCouplesRaw ?? []).map((c) => ({
    id: c.id,
    status: c.status,
    elimination_week: c.elimination_week,
    celebrity_name: c.celebrity?.name ?? "Unknown",
    pro_name: c.pro?.name ?? "Unknown",
  }));

  const displayNames = buildCoupleDisplayNames(allCouples);

  const { revealedOpen, hiddenOpenCount } = partitionRecastSlots(
    (myRosterSlots ?? [])
      .filter((s) => s.couples)
      .map((s) => ({
        slotNumber: s.slot_number,
        status: s.couples!.status,
        eliminationWeek: s.couples!.elimination_week,
        celebrity: s.couples!.celebrity?.name ?? "Unknown",
        pro: s.couples!.pro?.name ?? "Unknown",
        coupleId: s.couples!.id,
      })),
    cutoffWeek,
    finaleWeekNumber
  );

  const openSlots = revealedOpen.map((s) => ({
    slotNumber: s.slotNumber,
    formerCoupleName: formatCoupleName(
      displayNames.get(s.coupleId) ?? { celebrity: s.celebrity, pro: s.pro }
    ),
  }));

  const rosteredCoupleIds = new Set((rosteredSlots ?? []).map((s) => s.couple_id));
  const availableCouples = allCouples
    .filter(
      (c) =>
        isSpoilerSafeActive(
          { status: c.status, eliminationWeek: c.elimination_week },
          cutoffWeek,
          finaleWeekNumber
        ) && !rosteredCoupleIds.has(c.id)
    )
    .sort((a, b) => a.celebrity_name.localeCompare(b.celebrity_name));

  return (
    <WaiversPanel
      leagueId={id}
      closeHref={closeHref}
      claimMethod={league.waiver_claim_method!}
      isCommissioner={membership?.role === "commissioner"}
      openSlots={openSlots}
      hiddenOpenSlotCount={hiddenOpenCount}
      pendingRevealWeek={cutoff.pendingRevealEpisode?.week_number ?? null}
      availableCouples={availableCouples}
      coupleDisplayNames={Object.fromEntries(displayNames)}
      claims={(claims ?? []).map((c) => ({
        id: c.id,
        managerName: c.profiles?.display_name ?? "Unknown",
        coupleName: c.couples
          ? formatCoupleName(
              displayNames.get(c.couple_id) ?? {
                celebrity: c.couples.celebrity?.name ?? "Unknown",
                pro: c.couples.pro?.name ?? "Unknown",
              }
            )
          : "Unknown",
        slotNumber: c.slot_number,
        status: c.status,
        createdAt: c.created_at,
      }))}
    />
  );
}
