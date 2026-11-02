import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import { describe, expect, it, vi } from "vitest";
import { buildPublicationPlan, publishEpisodeAtomically, type PublicationSnapshot } from "./episode-publication";

describe("buildPublicationPlan", () => {
  // A posted couple with one live dance whose draft may hold a second one.
  function snapshotWithDraftDances(draftDances: { style: string; song: string | null; marks: number[] }[]): PublicationSnapshot {
    return {
      season: { id: "s" },
      episodes: [{ id: "ep", season_id: "s", week_id: "w", episode_number: 1, results_published_at: null }],
      weeks: [{ id: "w", season_id: "s", week_number: 8, is_elimination_week: true, is_finale: false, is_double_elimination_week: false }],
      couples: [{ id: "amber", season_id: "s", status: "active", elimination_week: null }],
      dances: [{ id: "live", episode_id: "ep", couple_id: "amber", dance_style_id: "contemporary", song_title: "Easy as Life", total_score: 33, scaled_score: 24.75 }],
      outcomes: [],
      jeopardy: [],
      leagues: [],
      settings: [],
      rosters: [],
      predictions: [],
      lateUnlocks: [],
      grandFinalePredictions: [],
      draftOverrides: [{ episode_id: "ep" }],
      draftDances: draftDances.map((d, i) => ({ id: `d${i}`, episode_id: "ep", couple_id: "amber", dance_style_id: d.style, song_title: d.song })),
      draftJudges: draftDances.flatMap((d, i) => d.marks.map((score, j) => ({ draft_dance_score_id: `d${i}`, judge_id: `j${j}`, score }))),
      draftResults: [{ episode_id: "ep", couple_id: "amber", outcome: "safe" }],
      draftJeopardy: [],
      draftMoments: [],
    } as unknown as PublicationSnapshot;
  }

  it("refuses while a posted couple's draft holds a dance that never went live", () => {
    const late = snapshotWithDraftDances([
      { style: "contemporary", song: "Easy as Life", marks: [8, 8, 9, 8] },
      { style: "freestyle", song: "Zoo", marks: [9, 9, 9, 9] },
    ]);
    expect(() => buildPublicationPlan(late, "ep")).toThrow(/Posted scores for 1 couple differ from their draft/);
    const edited = snapshotWithDraftDances([{ style: "contemporary", song: "Easy as Life", marks: [10, 10, 10, 10] }]);
    expect(() => buildPublicationPlan(edited, "ep")).toThrow(/differ from their draft/);
  });

  it("publishes when the posted couple's draft and live dances agree", () => {
    const same = snapshotWithDraftDances([{ style: "contemporary", song: "Easy as Life", marks: [8, 8, 9, 8] }]);
    expect(buildPublicationPlan(same, "ep").weeklyScores).toEqual([]);
  });
});

describe("publishEpisodeAtomically", () => {
  it("fails without any live write if the migration has not been applied", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "Publication RPC not installed" } });
    const from = vi.fn();
    const admin = { rpc, from } as unknown as SupabaseClient<Database>;
    expect(await publishEpisodeAtomically(admin, "episode", "admin")).toEqual({
      error: "Publication RPC not installed",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
  });

  it("does not commit if snapshot preparation fails", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { episodes: [], season: null }, error: null });
    const admin = { rpc } as unknown as SupabaseClient<Database>;
    expect((await publishEpisodeAtomically(admin, "episode", "admin")).error).toContain(
      "active season"
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
