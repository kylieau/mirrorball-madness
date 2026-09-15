// week_part only shows up in the label once a week actually has more than
// one broadcast (e.g. a two-night premiere) — the ordinary case stays
// exactly "Week N".
export function formatWeekLabel(weekNumber: number, weekPart: number): string {
  return weekPart > 1 ? `Week ${weekNumber} (Part ${weekPart})` : `Week ${weekNumber}`;
}

// A single sortable/comparable number for "which of these two aired later,"
// since week_number alone ties across a multi-part week (e.g. a two-night
// premiere). week_part is assumed < 1000 — no season has ever had close to
// that many broadcasts in one week_number.
export function weekSortKey(weekNumber: number, weekPart: number): number {
  return weekNumber * 1000 + weekPart;
}
