import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountSettingsData } from "@/lib/account-settings-data";
import { listPendingAccountDeletions } from "@/lib/account-deletions";
import { PendingAccountDeletions } from "@/components/pending-account-deletions";
import { PageHeader } from "@/components/page-header";
import { TopBar } from "@/components/top-bar";

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

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-8 pb-8">
      <TopBar {...accountSettingsData} email={user.email ?? ""} />
      <PageHeader title="Accounts" />
      <p className="text-sm text-muted-foreground">
        Queue only — clearing a request does not delete the auth user or league
        history. There is still no safe automatic wipe.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <PendingAccountDeletions requests={requests} />
    </div>
  );
}
