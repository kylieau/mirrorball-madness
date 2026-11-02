import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import { describe, expect, it, vi } from "vitest";
import { detectTeamEntity, isMissingSchemaError, loadEpisodeTeams, loadTeamNames, saveTeamMarks } from "./episode-teams";

type Result = { data: unknown; error: { code?: string; message: string } | null };

// A PostgREST-shaped client whose table reads resolve to the given results.
function clientWith(results: Record<string, Result>, rpc = vi.fn()) {
  const from = vi.fn((table: string) => {
    const result = results[table] ?? { data: [], error: null };
    const builder = {
      select: () => builder,
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      then: (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve),
    };
    return builder;
  });
  return { client: { from, rpc } as unknown as SupabaseClient<Database>, from, rpc };
}

const missingColumn = { code: "42703", message: "column dance_scores.team_id does not exist" };
const missingTable = { code: "PGRST205", message: "Could not find the table 'public.episode_teams' in the schema cache" };

describe("detectTeamEntity", () => {
  it("is false while dance_scores.team_id cannot be selected, true once it can", async () => {
    expect(await detectTeamEntity(clientWith({ dance_scores: { data: null, error: missingColumn } }).client)).toBe(false);
    expect(await detectTeamEntity(clientWith({ dance_scores: { data: [], error: null } }).client)).toBe(true);
    // Any failure reads as "not applied": the safe default never 400s a page.
    expect(await detectTeamEntity(clientWith({ dance_scores: { data: null, error: { code: "500", message: "boom" } } }).client)).toBe(false);
  });

  it("recognises missing tables and columns by code or message", () => {
    expect(isMissingSchemaError(missingColumn)).toBe(true);
    expect(isMissingSchemaError(missingTable)).toBe(true);
    expect(isMissingSchemaError({ code: "42P01", message: 'relation "public.episode_team_marks" does not exist' })).toBe(true);
    expect(isMissingSchemaError({ code: "PGRST301", message: "JWT expired" })).toBe(false);
  });
});

describe("loadEpisodeTeams", () => {
  it("falls back to the inferred mode instead of throwing when the tables are missing", async () => {
    const { client } = clientWith({ episode_teams: { data: null, error: missingTable }, episode_team_members: { data: null, error: missingTable } });
    expect(await loadEpisodeTeams(client, client, ["ep"])).toEqual({ mode: "inferred", teamsByEpisode: {}, marksByTeam: {} });
  });

  it("surfaces every other read error", async () => {
    const { client } = clientWith({ episode_teams: { data: null, error: { code: "500", message: "boom" } } });
    await expect(loadEpisodeTeams(client, client, ["ep"])).rejects.toThrow(/Could not load the episode teams/);
  });

  it("groups members and marks under their team, with the posted state", async () => {
    const { client } = clientWith({
      episode_teams: {
        data: [
          { id: "t1", episode_id: "ep", name: "Slaytopia", song_title: "Zoo", song_source: null, dance_style_id: "fs", captain_couple_id: "a", host_name: null, sort_order: 1, posted_at: "2026-11-03T02:00:00Z" },
          { id: "t2", episode_id: "ep", name: "Wildcats", song_title: null, song_source: null, dance_style_id: "fs", captain_couple_id: null, host_name: "Julianne", sort_order: 2, posted_at: null },
        ],
        error: null,
      },
      episode_team_members: { data: [{ team_id: "t1", couple_id: "b" }, { team_id: "t1", couple_id: "a" }, { team_id: "t2", couple_id: "c" }], error: null },
    });
    const { client: admin } = clientWith({ episode_team_marks: { data: [{ team_id: "t1", judge_id: "j1", score: "9" }, { team_id: "t1", judge_id: "j2", score: 8 }], error: null } });
    const loaded = await loadEpisodeTeams(client, admin, ["ep"]);
    expect(loaded.mode).toBe("entity");
    expect(loaded.teamsByEpisode.ep.map((t) => [t.name, t.memberCoupleIds, t.postedAt, t.inferred])).toEqual([
      ["Slaytopia", ["a", "b"], "2026-11-03T02:00:00Z", false],
      ["Wildcats", ["c"], null, false],
    ]);
    expect(loaded.marksByTeam).toEqual({ t1: [{ judgeId: "j1", score: 9 }, { judgeId: "j2", score: 8 }] });
  });

  it("asks nothing when there are no episodes", async () => {
    const { client, from } = clientWith({});
    expect(await loadEpisodeTeams(client, client, [])).toEqual({ mode: "entity", teamsByEpisode: {}, marksByTeam: {} });
    expect(from).not.toHaveBeenCalled();
  });
});

describe("loadTeamNames", () => {
  it("maps ids to names and reads as empty on any error", async () => {
    expect(await loadTeamNames(clientWith({ episode_teams: { data: [{ id: "t1", name: "Slaytopia" }], error: null } }).client, ["ep"])).toEqual({ t1: "Slaytopia" });
    expect(await loadTeamNames(clientWith({ episode_teams: { data: null, error: missingTable } }).client, ["ep"])).toEqual({});
    expect(await loadTeamNames(clientWith({}).client, [])).toEqual({});
  });
});

describe("saveTeamMarks", () => {
  it("refuses out-of-range marks before any round trip and translates a missing migration", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: missingTable });
    const { client } = clientWith({}, rpc);
    expect((await saveTeamMarks(client, { episodeId: "ep", teamId: "t", marks: [{ judgeId: "j", score: 11 }] }, "friend")).error).toMatch(/between 0 and 10/);
    expect(rpc).not.toHaveBeenCalled();
    expect((await saveTeamMarks(client, { episodeId: "ep", teamId: "t", marks: [{ judgeId: "j", score: 9 }] }, "friend")).error).toMatch(/apply-team-dance-entity\.sql/);
    expect(rpc).toHaveBeenCalledWith("save_team_marks", expect.objectContaining({ p_actor_id: "friend", p_team_id: "t" }));
  });
});
