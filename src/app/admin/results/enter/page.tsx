import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { ResultsForm } from "@/components/results-form";
import { TopBar } from "@/components/top-bar";
import { userIsAnyLeagueCommissioner } from "@/lib/results";
import { loadResultsPageData } from "@/lib/results-page-data";
import { buildCoupleDisplayNames } from "@/lib/couple-display";
import { getAccountSettingsData } from "@/lib/account-settings-data";

// Propose tier only (super admin or any league's commissioner); everyone else
// lands back on Scores. The actions re-check access server-side. ?episode=
// opens a week directly (Scores' "Continue in Enter Results").
export default async function EnterResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ episode?: string }>;
}) {
  const { episode } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const accountSettingsData = await getAccountSettingsData(supabase, user.id);
  const canPropose =
    accountSettingsData.isSuperAdmin || (await userIsAnyLeagueCommissioner(createAdminClient(), user.id));
  if (!canPropose) {
    redirect("/admin/results");
  }

  const data = await loadResultsPageData(supabase, createAdminClient());

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-8 pb-8">
      <TopBar {...accountSettingsData} email={user.email ?? ""} />

      <PageHeader title="Enter Results">
        <Button
          render={<Link href="/admin/results" />}
          nativeButton={false}
          size="sm"
          variant="ghost"
          className="-ml-2"
        >
          <ArrowLeftIcon className="size-4" />
          Back to Scores
        </Button>
      </PageHeader>

      <ResultsForm
        canPublish={accountSettingsData.isSuperAdmin}
        activeCouples={data.activeCouples}
        allCouplesWithStatus={data.allCouplesWithStatus}
        coupleDisplayNames={Object.fromEntries(buildCoupleDisplayNames(data.activeCouples))}
        allCoupleDisplayNames={Object.fromEntries(buildCoupleDisplayNames(data.allCouples))}
        judges={data.judges}
        danceStyles={data.danceStyles}
        episodes={data.episodes}
        weeks={data.weeks}
        draftsByEpisode={data.draftsByEpisode}
        revealedByEpisode={data.revealedByEpisode}
        releasedCoupleIdsByEpisode={data.releasedCoupleIdsByEpisode}
        forceSelectEpisodeId={episode ?? null}
        participantsByEpisode={data.participantsByEpisode}
      />
    </div>
  );
}
