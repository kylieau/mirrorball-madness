// Picker values that are not couple ids. buildDraftInput must never send
// these as coupleId: a special dance is never a couple.
export const TEAM_PICK_PREFIX = "team:";
export const ADD_SPECIAL_VALUE = "add-special";
export const NEW_SPECIAL_ID = "new";

export function teamPickValue(teamId: string): string {
  return `${TEAM_PICK_PREFIX}${teamId}`;
}

// The couples a draft save may mention: known couple ids only, so a picker
// value of team:<id> or add-special is dropped.
export function coupleIdsForDraft(ids: string[], knownCoupleIds: ReadonlySet<string>): string[] {
  return ids.filter((id) => knownCoupleIds.has(id));
}

// A couple's saved dances in their round slots, null where a slot is empty:
// at least slotCount slots, or one when nothing was saved and none is
// expected. A dance with no slot (saved before slots were stored, or copied
// from a live dance) or whose slot is taken fills the first empty one, the
// order the page used before.
export function placeDraftDances<T extends { slot: number | null }>(dances: T[], slotCount: number): (T | null)[] {
  const placed: (T | null)[] = [];
  const loose: T[] = [];
  for (const dance of dances) {
    if (dance.slot != null && dance.slot >= 1 && placed[dance.slot - 1] == null) placed[dance.slot - 1] = dance;
    else loose.push(dance);
  }
  for (const dance of loose) {
    let i = 0;
    while (placed[i] != null) i++;
    placed[i] = dance;
  }
  const length = Math.max(slotCount, placed.length, 1);
  return Array.from({ length }, (_, i) => placed[i] ?? null);
}
