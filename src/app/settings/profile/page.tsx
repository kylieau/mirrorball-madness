import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/profile-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { safeRelativePath } from "@/lib/safe-relative-path";

export default async function ProfilePage({
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
    .select("display_name")
    .eq("id", user.id)
    .single();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
      <Link href={settingsHref} className="text-sm text-muted-foreground hover:text-foreground">
        ‹ Settings
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>

      <Card>
        <CardHeader>
          <CardTitle>Display Name</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm displayName={profile?.display_name ?? ""} />
        </CardContent>
      </Card>
    </div>
  );
}
