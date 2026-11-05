import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type DraftLineupRow = {
  week_id: string;
  couple_id: string;
  dance_style_name: string;
  song_title: string | null;
  created_at: string;
};

// A deploy can land before apply-draft-lineup.sql runs; that reads as no
// lineup rather than an error on a fan page.
export async function loadDraftLineup(supabase: SupabaseClient<Database>): Promise<DraftLineupRow[]> {
  const { data, error } = await supabase.rpc("visible_draft_lineup");
  return error ? [] : (data ?? []);
}

// One week's announced dances per couple ("Paso Doble · Bring Me to Life"),
// in the order they were entered. Empty until the viewer has watched every
// earlier completed week, since who is still dancing gives away who went home.
export function weekLineup(
  rows: DraftLineupRow[],
  week: { id: string; week_number: number },
  completedWeeks: { id: string; week_number: number }[],
  watchedWeekIds: ReadonlySet<string>
): Map<string, string[]> {
  const lineup = new Map<string, string[]>();
  if (completedWeeks.some((w) => w.week_number < week.week_number && !watchedWeekIds.has(w.id))) return lineup;
  for (const row of [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (row.week_id !== week.id) continue;
    const song = row.song_title?.trim();
    lineup.set(row.couple_id, [...(lineup.get(row.couple_id) ?? []), song ? `${row.dance_style_name} · ${song}` : row.dance_style_name]);
  }
  return lineup;
}
