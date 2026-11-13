import { formatEpisodeCasual } from "./format-week";

// Mirrors release_effective_week(): the first week whose first night hasn't
// aired, else the week after the last one (so a removal between the
// Finale's nights keeps the Finale). Weeks with no episode yet don't count,
// and as in SQL's min(), a night with no air time only counts when every
// night of the week has none.
export function releaseEffectiveWeek(
  weeks: { weekNumber: number; airsAt: (string | null)[] }[],
  now: Date = new Date()
): number {
  const scheduled = weeks.filter((week) => week.airsAt.length > 0);
  const unaired = scheduled.filter((week) => {
    const times = week.airsAt.flatMap((airsAt) => (airsAt === null ? [] : [new Date(airsAt).getTime()]));
    return times.length === 0 || Math.min(...times) > now.getTime();
  });
  if (unaired.length > 0) return Math.min(...unaired.map((week) => week.weekNumber));
  if (scheduled.length > 0) return Math.max(...scheduled.map((week) => week.weekNumber)) + 1;
  return 1;
}

export type RemovalTerms = { effectiveWeek: number; recastOn: boolean };

// What a removal does to a drafted team, for the confirm dialogs: the
// removed person ("Kim's" / "them") in Remove, the viewer ("Your" / "you")
// in Leave.
export function removalNote(whose: string, them: "them" | "you", terms: RemovalTerms | null): string {
  if (!terms) return them === "you" ? "You'll lose access to this league." : "They'll lose access to this league.";
  const from = formatEpisodeCasual(terms.effectiveWeek);
  const couples = terms.recastOn
    ? `${whose} couples go to the waiver wire from ${from}.`
    : `${whose} couples become undrafted from ${from}; turn on Recast to let managers claim them.`;
  return `${couples} Points through the week before stay in the standings history. Open waiver claims and trade offers are cancelled. This can't be undone, and the invite code won't let ${them} back in.`;
}
