import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateEmail, updatePassword, cancelAccountDeletion } from "./actions";
import { RequestDeletionButton } from "@/components/request-deletion-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { safeRelativePath } from "@/lib/safe-relative-path";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; from?: string }>;
}) {
  const { error, message, from } = await searchParams;
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
      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && <p className="text-sm text-muted-foreground">{message}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Email</CardTitle>
          <CardDescription>Currently {user.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateEmail} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">New Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <Button type="submit" className="self-start">
              Update email
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updatePassword} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">New Password</Label>
              <Input id="password" name="password" type="password" required minLength={6} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input id="confirmPassword" name="confirmPassword" type="password" required minLength={6} />
            </div>
            <Button type="submit" className="self-start">
              Update password
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent>
          {profile?.deletion_requested_at ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Deletion requested on {new Date(profile.deletion_requested_at).toLocaleDateString()}.
                It hasn&apos;t been processed yet — you can still cancel.
              </p>
              <form action={cancelAccountDeletion}>
                <Button variant="outline" type="submit">
                  Cancel deletion request
                </Button>
              </form>
            </div>
          ) : (
            <RequestDeletionButton />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
