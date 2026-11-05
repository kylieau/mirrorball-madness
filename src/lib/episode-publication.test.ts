import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import { describe, expect, it, vi } from "vitest";
import { buildPublicationPlan, isTeamRow, publishEpisodeAtomically, teamScoreRows, type PublicationSnapshot } from "./episode-publication";

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

  function withTeam(base: PublicationSnapshot, marks: number[], extra: Partial<PublicationSnapshot> = {}): PublicationSnapshot {
    return {
      ...base,
      couples: [...base.couples, { id: "julia", season_id: "s", status: "active", elimination_week: null }, { id: "whitney", season_id: "s", status: "withdrawn", elimination_week: 7 }],
      draftResults: [...base.draftResults, { episode_id: "ep", couple_id: "julia", outcome: "safe" }],
      teams: [{ id: "t", episode_id: "ep", name: "Slaytopia", song_title: "Zoo", dance_style_id: "freestyle", captain_couple_id: null, host_name: null, sort_order: 1, posted_at: null }],
      teamMembers: ["amber", "julia", "whitney"].map((couple_id) => ({ team_id: "t", episode_id: "ep", couple_id })),
      teamMarks: marks.map((score, i) => ({ team_id: "t", judge_id: `j${i}`, score })),
      participants: [],
      ...extra,
    } as unknown as PublicationSnapshot;
  }

  it("refuses to finish while a team with members has fewer than four marks", () => {
    const half = withTeam(snapshotWithDraftDances([{ style: "contemporary", song: "Easy as Life", marks: [8, 8, 9, 8] }]), [9, 9, 9]);
    expect(() => buildPublicationPlan(half, "ep")).toThrow(/Team Slaytopia has 3 of four marks/);
  });

  it("pays every eligible member the team's marks and skips the withdrawn", () => {
    const full = withTeam(snapshotWithDraftDances([{ style: "contemporary", song: "Easy as Life", marks: [8, 8, 9, 8] }]), [9, 9, 9, 9]);
    const rows = teamScoreRows(full, "ep");
    expect(rows.map((r) => [r.couple_id, r.total_score, r.scaled_score, r.team_id])).toEqual([
      ["amber", 36, 27, "t"],
      ["julia", 36, 27, "t"],
    ]);
    expect(() => buildPublicationPlan(full, "ep")).not.toThrow();
  });

  it("does not count a team's live row as the couple being posted", () => {
    // Amber's only live row is the team's; her own draft must still publish, with no divergence error.
    const base = snapshotWithDraftDances([{ style: "contemporary", song: "Easy as Life", marks: [8, 8, 9, 8] }]);
    const teamOnly = withTeam({ ...base, dances: [{ ...base.dances[0], dance_style_id: "freestyle", song_title: "Zoo", total_score: 36, scaled_score: 27, team_id: "t" }] }, [9, 9, 9, 9]);
    expect(isTeamRow(teamOnly.dances[0])).toBe(true);
    expect(() => buildPublicationPlan(teamOnly, "ep")).not.toThrow();
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
