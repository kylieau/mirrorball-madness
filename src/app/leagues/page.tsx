import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateJoinLeagueDialogs } from "@/components/create-join-league-dialogs";
import { LeaveLeagueButton } from "@/components/leave-league-button";
import { Card, CardContent } from "@/components/ui/card";
import { CrownIcon } from "lucide-react";

export default async function LeaguesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: memberships } = await supabase
    .from("league_members")
    .select("role, leagues(id, name)")
    .eq("user_id", user.id);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
      <div className="flex flex-col gap-6">
        {memberships && memberships.length > 0 && (
          <Link
            href={`/leagues/${memberships[0].leagues!.id}`}
            className="text-sm font-medium text-muted-foreground"
          >
            ‹ Back
          </Link>
        )}

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Leagues</h1>
            <p className="mt-1 text-sm text-muted-foreground">Browse &amp; manage</p>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          </div>
          <CreateJoinLeagueDialogs />
        </div>

        {memberships && memberships.length > 0 ? (
          <div className="flex flex-col gap-2">
            {memberships.map((m) => {
              const league = m.leagues!;
              const isCommissioner = m.role === "commissioner";
              return (
                <Card key={league.id}>
                  <CardContent className="flex items-center justify-between gap-3 py-4">
                    <Link href={`/leagues/${league.id}`} className="flex flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        {isCommissioner && (
                          <CrownIcon className="size-3.5 text-primary" aria-hidden />
                        )}
                        {league.name}
                      </span>
                      <span className="text-xs capitalize text-muted-foreground">{m.role}</span>
                    </Link>
                    <LeaveLeagueButton
                      leagueId={league.id}
                      leagueName={league.name}
                      isCommissioner={isCommissioner}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            You haven&apos;t joined a league yet — create one or join with an invite code above.
          </p>
        )}
      </div>
    </div>
  );
}
