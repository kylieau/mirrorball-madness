import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccountSettingsData } from "@/lib/account-settings-data";
import { loadResultsTaxonomy } from "@/lib/results";
import { JudgesDanceStylesManager } from "@/components/judges-dance-styles-manager";
import { PageHeader } from "@/components/page-header";
import { TopBar } from "@/components/top-bar";

export default async function ShowSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const accountSettingsData = await getAccountSettingsData(supabase, user.id);
  if (!accountSettingsData.isSuperAdmin) {
    redirect("/");
  }

  const { judges, danceStyles, roundTypes } = await loadResultsTaxonomy(supabase);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-8 pb-8">
      <TopBar {...accountSettingsData} email={user.email ?? ""} />
      <PageHeader title="Show Settings" />
      <JudgesDanceStylesManager judges={judges} danceStyles={danceStyles} roundTypes={roundTypes} />
    </div>
  );
}
