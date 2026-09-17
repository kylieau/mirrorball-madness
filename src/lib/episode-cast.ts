// Who belongs on an admin "include this couple" list for a given episode.
// Unpublished / upcoming pickers are the still-competing cast only — once
// someone is voted off they should not be re-ticked onto next week's
// schedule. Published weeks keep whoever was still in as of that week so
// correcting history doesn't drop the couple who went home that night.

import { resolveEpisodeCoupleIds } from "./episode-participants";

export type CastStatus = {
  status: string;
  elimination_week: number | null;
};

export function isActiveCastStatus(status: string): boolean {
  return status === "active";
}

export function wasInCastForWeek(couple: CastStatus, weekNumber: number): boolean {
  if (couple.status === "active") return true;
  if (couple.status === "eliminated" || couple.status === "withdrawn") {
    return couple.elimination_week != null && couple.elimination_week >= weekNumber;
  }
  return couple.status === "winner" || couple.status === "runner_up" || couple.status === "third_place";
}

export function selectableCast<T extends CastStatus>(
  couples: T[],
  weekNumber: number,
  opts: { published: boolean }
): T[] {
  return couples.filter((c) =>
    opts.published ? wasInCastForWeek(c, weekNumber) : isActiveCastStatus(c.status)
  );
}

// Empty / missing configured participants means "unrestricted" — check
// everyone selectable. Otherwise keep the saved subset but drop anyone
// who is no longer allowed on this episode (already eliminated, etc.).
export function defaultCheckedParticipantIds(
  configured: string[] | undefined,
  selectableIds: string[]
): string[] {
  if (!configured || configured.length === 0) return [...selectableIds];
  const allowed = new Set(selectableIds);
  return configured.filter((id) => allowed.has(id));
}

export function isFullSelectableCast(selectedIds: Iterable<string>, selectableIds: string[]): boolean {
  const selected = new Set(selectedIds);
  return selected.size === selectableIds.length && selectableIds.every((id) => selected.has(id));
}

export function participantIdsToPersist(
  selectedIds: Iterable<string>,
  selectableIds: string[]
): string[] {
  const allowed = new Set(selectableIds);
  const sanitized = [...selectedIds].filter((id) => allowed.has(id));
  return isFullSelectableCast(sanitized, selectableIds) ? [] : sanitized;
}

export function resultsEntryCoupleIds(opts: {
  selectableIds: string[];
  participantIds: string[];
  draftCoupleIds: string[];
  published: boolean;
}): string[] {
  const narrowed = resolveEpisodeCoupleIds(opts.selectableIds, opts.participantIds);
  if (!opts.published) return narrowed;
  const allowed = new Set(opts.selectableIds);
  const extras = opts.draftCoupleIds.filter((id) => allowed.has(id));
  return [...new Set([...narrowed, ...extras])];
}
