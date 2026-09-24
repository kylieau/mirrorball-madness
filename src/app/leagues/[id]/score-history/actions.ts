"use server";

import { createClient } from "@/lib/supabase/server";
import { loadScoreHistory } from "@/lib/score-history-data";
import type { ScoreHistoryLine } from "@/lib/score-history";

export async function getScoreHistory(
  leagueId: string,
  managerId: string
): Promise<{ lines: ScoreHistoryLine[]; error: null } | { lines: null; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { lines: null, error: "Not signed in" };

  return loadScoreHistory(supabase, { userId: user.id, leagueId, managerId });
}
