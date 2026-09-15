import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AccountDataForm } from "@/components/account-data-form";
import { Card, CardContent } from "@/components/ui/card";
import { safeRelativePath } from "@/lib/safe-relative-path";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const settingsHref = from ? `/settings?from=${encodeURIComponent(safeRelativePath(from, "/leagues"))}` : "/settings";
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("deletion_requested_at")
    .eq("id", user.id)
    .single();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
      <Link href={settingsHref} className="text-sm text-muted-foreground hover:text-foreground">
        ‹ Settings
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Account &amp; Data</h1>

      <Card>
        <CardContent className="pt-6">
          <AccountDataForm email={user.email ?? ""} deletionRequestedAt={profile?.deletion_requested_at ?? null} />
        </CardContent>
      </Card>
    </div>
  );
}
