// Picker values that are not couple ids. buildDraftInput must never send
// these as coupleId: a special dance is never a couple, and a nested member
// row opens that couple's own card under the couple's real id.
export const TEAM_PICK_PREFIX = "team:";
export const MEMBER_PICK_PREFIX = "member:";
export const ADD_SPECIAL_VALUE = "add-special";
export const NEW_SPECIAL_ID = "new";

export function teamPickValue(teamId: string): string {
  return `${TEAM_PICK_PREFIX}${teamId}`;
}

export function memberPickValue(entryId: string, coupleId: string): string {
  return `${MEMBER_PICK_PREFIX}${entryId}:${coupleId}`;
}

export function parseMemberPick(value: string): { entryId: string; coupleId: string } | null {
  if (!value.startsWith(MEMBER_PICK_PREFIX)) return null;
  const rest = value.slice(MEMBER_PICK_PREFIX.length);
  const colon = rest.indexOf(":");
  if (colon <= 0) return null;
  const entryId = rest.slice(0, colon);
  const coupleId = rest.slice(colon + 1);
  return entryId && coupleId ? { entryId, coupleId } : null;
}

// The couples a draft save may mention: known couple ids only, so a picker
// value of team:<id>, member:<entry>:<couple>, or add-special is dropped.
export function coupleIdsForDraft(ids: string[], knownCoupleIds: ReadonlySet<string>): string[] {
  return ids.filter((id) => knownCoupleIds.has(id));
}
