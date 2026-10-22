import Link from "next/link";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { joinLeague } from "@/app/leagues/actions";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function JoinLeaguePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const inviteCode = code.toUpperCase();
  const nextPath = `/join/${inviteCode}`;

  const supabase = await createClient();
  const [user, { data: previews }] = await Promise.all([
    getAuthUser(),
    supabase.rpc("league_invite_preview", { p_invite_code: inviteCode }),
  ]);
  const preview = previews?.[0];
  const codeLine = (
    <>
      Invite Code <span className="font-mono font-medium text-foreground">{inviteCode}</span>
    </>
  );

  if (!preview) {
    return (
      <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-24">
        <Card>
          <CardHeader>
            <CardTitle>Invite Code Not Found</CardTitle>
            <CardDescription>{codeLine} doesn&apos;t match a league. Check the link with whoever invited you.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button render={<Link href="/" />} nativeButton={false} variant="outline" className="w-full">
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-24">
      <Link href="/" className="-mb-2 text-sm text-muted-foreground">
        ‹ Back to Home
      </Link>
      <Card>
        <CardHeader>
          <CardTitle className="wrap-anywhere">Join {preview.league_name}</CardTitle>
          <CardDescription>
            {preview.team_count} {preview.team_count === 1 ? "manager" : "managers"} so far · {codeLine}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {preview.draft_in_progress && (
            <p className="text-sm text-amber-text">This league is drafting right now. You can join once the draft is done.</p>
          )}
          {user ? (
            <form action={joinLeague}>
              <input type="hidden" name="inviteCode" value={inviteCode} />
              <SubmitButton
                idleLabel="Join League"
                pendingLabel="Joining…"
                className="w-full"
                disabled={preview.draft_in_progress}
              />
            </form>
          ) : (
            <div className="flex flex-col gap-2">
              <Button
                render={<Link href={`/sign-up?next=${encodeURIComponent(nextPath)}`} />}
                nativeButton={false}
                className="w-full"
              >
                Create an Account to Join
              </Button>
              <Button
                render={<Link href={`/login?next=${encodeURIComponent(nextPath)}`} />}
                nativeButton={false}
                variant="outline"
                className="w-full"
              >
                Sign In to Join
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
