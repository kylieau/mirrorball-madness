import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRightIcon } from "lucide-react";
import { safeRelativePath } from "@/lib/safe-relative-path";

const LINKED_ROWS = [
  { label: "Profile", href: "/settings/profile" },
  { label: "Notifications", href: "/notifications" },
  { label: "Account & data", href: "/settings/account" },
];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; from?: string }>;
}) {
  const { error, message, from } = await searchParams;
  // Every tab's avatar button links here with ?from=<its own path>, so Back
  // returns to whichever tab the user actually came from instead of always
  // landing on /leagues. Sub-pages (Profile, Notifications, Account & data)
  // forward this same value on their own "Back to Settings" link so it
  // survives going one level deeper.
  const backHref = safeRelativePath(from, "/leagues");
  const fromParam = `?from=${encodeURIComponent(backHref)}`;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .single();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
      <div className="flex flex-col gap-6">
        <Link href={backHref} className="text-sm font-medium text-muted-foreground">
          ‹ Back
        </Link>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Account-wide</p>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          {message && <p className="mt-2 text-sm text-muted-foreground">{message}</p>}
        </div>

        <Card>
          <CardContent className="flex flex-col p-0">
            {LINKED_ROWS.map((row) => (
              <Link
                key={row.href}
                href={`${row.href}${fromParam}`}
                className="flex items-center justify-between border-b border-border px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted"
              >
                <span>{row.label}</span>
                <ChevronRightIcon className="size-4 text-muted-foreground" />
              </Link>
            ))}
            <div className="flex items-center justify-between border-b border-border px-4 py-3 text-sm text-muted-foreground last:border-b-0">
              <span>Appearance</span>
              <span className="text-xs">Coming soon</span>
            </div>
          </CardContent>
        </Card>

        {profile?.is_super_admin && (
          <Link href="/admin/results">
            <Card className="transition-colors hover:bg-muted">
              <CardContent className="flex items-center justify-between py-4">
                <span className="text-sm font-medium">Site Admin</span>
                <ChevronRightIcon className="size-4 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        )}

        <form action={signOut}>
          <Button type="submit" variant="outline" className="w-full">
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}
