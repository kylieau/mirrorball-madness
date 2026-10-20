import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountSettingsData } from "@/lib/account-settings-data";
import { listPendingAccountDeletions } from "@/lib/account-deletions";
import { PendingAccountDeletions } from "@/components/pending-account-deletions";
import { PageHeader } from "@/components/page-header";
import { TopBar } from "@/components/top-bar";
import { ResultsContributors } from "@/components/results-contributors";

export default async function AdminAccountsPage() {
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

  const { requests, error } = await listPendingAccountDeletions(createAdminClient());
  const { data: accounts, error: accountsError } = await createAdminClient().from("profiles")
    .select("id, display_name, can_propose_results, is_super_admin").order("display_name");

  return (
    <div className="flex w-full flex-col gap-3 px-4 py-4">
      <TopBar {...accountSettingsData} email={user.email ?? ""} />
      <PageHeader title="Accounts" />
      <p className="text-sm text-muted-foreground">
        Queue only — clearing a request does not delete the auth user or league
        history. There is still no safe automatic wipe.
      </p>
      {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
      <PendingAccountDeletions requests={requests} />
      {accountsError ? <p role="alert" className="text-sm text-danger-text">Could not load results contributors.</p> :
        <ResultsContributors accounts={accounts ?? []} />}
    </div>
  );
}
