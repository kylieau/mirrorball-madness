import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { joinLeague } from "@/app/leagues/actions";
import { Button } from "@/components/ui/button";
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-24">
      <Card>
        <CardHeader>
          <CardTitle>You&apos;ve been invited to a league</CardTitle>
          <CardDescription>
            Invite Code <span className="font-mono font-medium text-foreground">{inviteCode}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {user ? (
            <form action={joinLeague}>
              <input type="hidden" name="inviteCode" value={inviteCode} />
              <Button type="submit" className="w-full">
                Join League
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
