import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { joinAsCoManager } from "@/app/leagues/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function JoinAsCoManagerPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const inviteCode = code.toUpperCase();
  const nextPath = `/join/co-manager/${inviteCode}`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Only shown once signed in — this schema never grants anon anything, so a
  // signed-out visitor sees the generic copy below until they sign up/in.
  const { data: inviteInfo } = user
    ? await supabase.rpc("get_co_manager_invite_info", { p_code: inviteCode }).maybeSingle()
    : { data: null };

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-24">
      <Card>
        <CardHeader>
          <CardTitle>You&apos;ve been invited as a co-manager</CardTitle>
          <CardDescription>
            {inviteInfo ? (
              <>
                You&apos;ll jointly run <strong className="text-foreground">{inviteInfo.primary_display_name}</strong>
                &apos;s team in <strong className="text-foreground">{inviteInfo.league_name}</strong> — same picks,
                same roster, same standings.
              </>
            ) : (
              <>
                You&apos;ll jointly run this fantasy team — same picks, same roster, same standings, as the person
                who invited you.
              </>
            )}
            <br />
            Invite Code <span className="font-mono font-medium text-foreground">{inviteCode}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {user ? (
            <form action={joinAsCoManager}>
              <input type="hidden" name="inviteCode" value={inviteCode} />
              <Button type="submit" className="w-full">
                Join as Co-Manager
              </Button>
            </form>
          ) : (
            <div className="flex flex-col gap-2">
              <Button
                render={<Link href={`/sign-up?next=${encodeURIComponent(nextPath)}`} />}
                nativeButton={false}
                className="w-full"
              >
                Create an account to join
              </Button>
              <Button
                render={<Link href={`/login?next=${encodeURIComponent(nextPath)}`} />}
                nativeButton={false}
                variant="outline"
                className="w-full"
              >
                Sign in to join
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
