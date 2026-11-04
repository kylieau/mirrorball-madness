import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import { describe, expect, it, vi } from "vitest";
import { JUDGE_MARK_MESSAGE } from "./judge-marks";
import {
  danceMaxScore,
  danceScoreColumns,
  detectTeamEntity,
  detectTeamsMode,
  isMissingSchemaError,
  loadEpisodeTeams,
  loadSpecialDanceLabels,
  saveSpecialDance,
  saveSpecialDancePoints,
  saveTeamMarks,
} from "./episode-teams";

type Result = { data: unknown; error: { code?: string; message: string } | null };

// A PostgREST-shaped client whose table reads resolve to the given results,
// keyed by table, or by "table.columns" when one select list must differ.
function clientWith(results: Record<string, Result>, rpc = vi.fn()) {
  const from = vi.fn((table: string) => {
    let columns = "";
    const builder = {
      select: (list: string) => {
        columns = list;
        return builder;
      },
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      then: (resolve: (value: Result) => unknown) =>
        Promise.resolve(results[`${table}.${columns}`] ?? results[table] ?? { data: [], error: null }).then(resolve),
    };
    return builder;
  });
  return { client: { from, rpc } as unknown as SupabaseClient<Database>, from, rpc };
}

const missingColumn = { code: "42703", message: "column dance_scores.team_id does not exist" };
const missingMaxScore = { code: "42703", message: "column dance_scores.max_score does not exist" };
const missingTable = { code: "PGRST205", message: "Could not find the table 'public.episode_teams' in the schema cache" };

describe("detectTeamEntity and detectTeamsMode", () => {
  it("is false while dance_scores.team_id cannot be selected, true once it can", async () => {
    expect(await detectTeamEntity(clientWith({ dance_scores: { data: null, error: missingColumn } }).client)).toBe(false);
    expect(await detectTeamEntity(clientWith({ dance_scores: { data: [], error: null } }).client)).toBe(true);
    // Any failure reads as "not applied": the safe default never 400s a page.
    expect(await detectTeamEntity(clientWith({ dance_scores: { data: null, error: { code: "500", message: "boom" } } }).client)).toBe(false);
  });

  it("reads inferred, entity, or special from what the schema can select", async () => {
    expect(await detectTeamsMode(clientWith({ dance_scores: { data: null, error: missingColumn } }).client)).toBe("inferred");
    expect(
      await detectTeamsMode(
        clientWith({
          "dance_scores.team_id": { data: [], error: null },
          "dance_scores.max_score": { data: null, error: missingMaxScore },
        }).client
      )
    ).toBe("entity");
    expect(
      await detectTeamsMode(
        clientWith({
          "dance_scores.team_id": { data: [], error: null },
          "dance_scores.max_score": { data: [], error: null },
          "episode_teams.scoring_mode": { data: null, error: { code: "42703", message: "column episode_teams.scoring_mode does not exist" } },
        }).client
      )
    ).toBe("entity");
    expect(await detectTeamsMode(clientWith({}).client)).toBe("special");
  });

  it("recognises missing tables, columns, and functions by code or message", () => {
    expect(isMissingSchemaError(missingColumn)).toBe(true);
    expect(isMissingSchemaError(missingTable)).toBe(true);
    expect(isMissingSchemaError({ code: "42P01", message: 'relation "public.episode_team_marks" does not exist' })).toBe(true);
    expect(isMissingSchemaError({ code: "PGRST202", message: "Could not find the function public.save_special_dance in the schema cache" })).toBe(true);
    expect(isMissingSchemaError({ message: "column episode_teams.scoring_mode does not exist" })).toBe(true);
    expect(isMissingSchemaError({ code: "PGRST301", message: "JWT expired" })).toBe(false);
  });

  it("builds each reader's select list from the mode", () => {
    expect(danceScoreColumns("inferred", "id, total_score", { teamId: true })).toBe("id, total_score");
    expect(danceScoreColumns("entity", "id, total_score", { teamId: true })).toBe("id, total_score, team_id");
    expect(danceScoreColumns("special", "id, total_score", { teamId: true })).toBe("id, total_score, team_id, max_score");
    expect(danceScoreColumns("special", "id, total_score")).toBe("id, total_score, max_score");
    expect(danceMaxScore({})).toBeNull();
    expect(danceMaxScore({ max_score: null })).toBeNull();
    expect(danceMaxScore({ max_score: "40" })).toBe(40);
    expect(danceMaxScore({ max_score: 0 })).toBe(0);
  });
});

describe("loadEpisodeTeams", () => {
  it("falls back to the inferred mode instead of throwing when the tables are missing", async () => {
    const { client } = clientWith({ episode_teams: { data: null, error: missingTable }, episode_team_members: { data: null, error: missingTable } });
    expect(await loadEpisodeTeams(client, client, ["ep"])).toEqual({ mode: "inferred", teamsByEpisode: {}, marksByTeam: {}, scoresByTeam: {} });
  });

  it("surfaces every other read error", async () => {
    const { client } = clientWith({ episode_teams: { data: null, error: { code: "500", message: "boom" } } });
    await expect(loadEpisodeTeams(client, client, ["ep"])).rejects.toThrow(/Could not load the episode teams/);
  });

  it("groups members and marks under their team, with the posted state, reading entity rows as Team Dances by marks", async () => {
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
    const { client: admin, from: adminFrom } = clientWith({ episode_team_marks: { data: [{ team_id: "t1", judge_id: "j1", score: "9" }, { team_id: "t1", judge_id: "j2", score: 8 }], error: null } });
    const loaded = await loadEpisodeTeams(client, admin, ["ep"]);
    expect(loaded.mode).toBe("entity");
    expect(loaded.teamsByEpisode.ep.map((t) => [t.name, t.memberCoupleIds, t.postedAt, t.inferred])).toEqual([
      ["Slaytopia", ["a", "b"], "2026-11-03T02:00:00Z", false],
      ["Wildcats", ["c"], null, false],
    ]);
    expect(loaded.teamsByEpisode.ep[0]).toMatchObject({
      danceType: "Team Dance",
      scoringMode: "marks",
      markMax: 10,
      panelJudgeIds: null,
      songs: [{ title: "Zoo", artist: null }],
      details: [{ label: "Captain", value: "", coupleId: "a" }],
    });
    expect(loaded.teamsByEpisode.ep[1].details).toEqual([{ label: "Host", value: "Julianne", coupleId: null }]);
    expect(loaded.marksByTeam).toEqual({ t1: [{ judgeId: "j1", score: 9 }, { judgeId: "j2", score: 8 }] });
    expect(loaded.scoresByTeam).toEqual({});
    expect(adminFrom).not.toHaveBeenCalledWith("episode_team_scores");
  });

  it("reads the special-dance columns, member order, and Points rows in special mode", async () => {
    const { client } = clientWith({
      episode_teams: {
        data: [
          {
            id: "d1", episode_id: "ep", name: "Dance-Off", song_title: "Zoo", song_source: "Zootopia 2", dance_style_id: "fs", captain_couple_id: null, host_name: null, sort_order: 1, posted_at: null,
            dance_type: "Dance-Off", scoring_mode: "points", mark_max: "10", panel_judge_ids: null, second_dance_style_id: "jive",
            songs: [{ title: "Zoo", artist: "Shakira" }, { title: "", artist: null }], theme_label: "Film",
            details: [{ label: "Host", value: "Alfonso", coupleId: null }, { label: "", value: "x" }], name_is_auto: true, updated_at: "2026-11-05T00:00:00Z",
          },
          {
            id: "t1", episode_id: "ep", name: "Relay", song_title: null, song_source: null, dance_style_id: "fs", captain_couple_id: null, host_name: null, sort_order: 2, posted_at: null,
            dance_type: "Relay", scoring_mode: "marks", mark_max: 8, panel_judge_ids: ["j1", "j2"], second_dance_style_id: null, songs: [], theme_label: null, details: [], name_is_auto: true, updated_at: "2026-11-05T00:00:00Z",
          },
        ],
        error: null,
      },
      episode_team_members: { data: [{ team_id: "d1", couple_id: "b", sort_order: 2 }, { team_id: "d1", couple_id: "a", sort_order: 1 }, { team_id: "t1", couple_id: "c", sort_order: 1 }], error: null },
    });
    const { client: admin } = clientWith({
      episode_team_marks: { data: [{ team_id: "t1", judge_id: "j1", score: "7.5" }], error: null },
      episode_team_scores: { data: [{ team_id: "d1", couple_id: "a", points: "3", result: "Winner" }, { team_id: "d1", couple_id: "b", points: null, result: null }], error: null },
    });
    const loaded = await loadEpisodeTeams(client, admin, ["ep"], "special");
    expect(loaded.mode).toBe("special");
    const [danceOff, relay] = loaded.teamsByEpisode.ep;
    expect(danceOff).toMatchObject({
      danceType: "Dance-Off",
      scoringMode: "points",
      nameIsAuto: true,
      memberCoupleIds: ["a", "b"],
      secondDanceStyleId: "jive",
      songs: [{ title: "Zoo", artist: "Shakira" }],
      themeLabel: "Film",
      details: [{ label: "Host", value: "Alfonso", coupleId: null }],
      updatedAt: "2026-11-05T00:00:00Z",
    });
    expect(relay).toMatchObject({ scoringMode: "marks", markMax: 8, panelJudgeIds: ["j1", "j2"], songs: [], details: [] });
    expect(loaded.marksByTeam).toEqual({ t1: [{ judgeId: "j1", score: 7.5 }] });
    expect(loaded.scoresByTeam).toEqual({
      d1: [
        { coupleId: "a", points: 3, result: "Winner" },
        { coupleId: "b", points: null, result: null },
      ],
    });
  });

  it("asks nothing when there are no episodes", async () => {
    const { client, from } = clientWith({});
    expect(await loadEpisodeTeams(client, client, [])).toEqual({ mode: "entity", teamsByEpisode: {}, marksByTeam: {}, scoresByTeam: {} });
    expect(from).not.toHaveBeenCalled();
  });
});

describe("loadSpecialDanceLabels", () => {
  it("maps ids to name, type, and mode, reading entity rows as Team Dances, and as empty on any error", async () => {
    expect(await loadSpecialDanceLabels(clientWith({ episode_teams: { data: [{ id: "t1", name: "Slaytopia" }], error: null } }).client, ["ep"], "entity")).toEqual({
      t1: { name: "Slaytopia", danceType: "Team Dance", scoringMode: "marks" },
    });
    expect(
      await loadSpecialDanceLabels(
        clientWith({ episode_teams: { data: [{ id: "d1", name: "Dance-Off 2", dance_type: "Dance-Off", scoring_mode: "points" }], error: null } }).client,
        ["ep"],
        "special"
      )
    ).toEqual({ d1: { name: "Dance-Off 2", danceType: "Dance-Off", scoringMode: "points" } });
    expect(await loadSpecialDanceLabels(clientWith({ episode_teams: { data: null, error: missingTable } }).client, ["ep"], "entity")).toEqual({});
    const { client, from } = clientWith({});
    expect(await loadSpecialDanceLabels(client, ["ep"], "inferred")).toEqual({});
    expect(await loadSpecialDanceLabels(client, [], "special")).toEqual({});
    expect(from).not.toHaveBeenCalled();
  });
});

describe("saveTeamMarks", () => {
  it("refuses out-of-range marks before any round trip and translates a missing migration", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: missingTable });
    const { client } = clientWith({}, rpc);
    for (const score of [11, 0, 8.5]) {
      expect((await saveTeamMarks(client, { episodeId: "ep", teamId: "t", marks: [{ judgeId: "j", score }] }, "friend")).error).toBe(JUDGE_MARK_MESSAGE);
    }
    expect(rpc).not.toHaveBeenCalled();
    expect((await saveTeamMarks(client, { episodeId: "ep", teamId: "t", marks: [{ judgeId: "j", score: 9 }] }, "friend")).error).toMatch(/apply-team-dance-entity\.sql/);
    expect(rpc).toHaveBeenCalledWith("save_team_marks", expect.objectContaining({ p_actor_id: "friend", p_team_id: "t" }));
  });
});

describe("saveSpecialDance and saveSpecialDancePoints", () => {
  it("translate a missing special-dances migration and pass the actor through", async () => {
    const missingFunction = { code: "PGRST202", message: "Could not find the function public.save_special_dance(p_actor_id, p_dance, p_episode_id) in the schema cache" };
    const rpc = vi.fn().mockResolvedValue({ data: null, error: missingFunction });
    const { client } = clientWith({}, rpc);
    const dance = {
      id: null, danceType: "Dance-Off", name: "", memberCoupleIds: ["a"], danceStyleId: null, secondDanceStyleId: null, songs: [],
      scoringMode: "points" as const, songSource: null, themeLabel: null, details: [], sortOrder: 1,
    };
    expect((await saveSpecialDance(client, { episodeId: "ep", dance }, "admin")).error).toMatch(/apply-special-dances\.sql/);
    expect(rpc).toHaveBeenCalledWith("save_special_dance", { p_episode_id: "ep", p_actor_id: "admin", p_dance: dance });
    expect((await saveSpecialDancePoints(client, { episodeId: "ep", teamId: "d1", scores: [{ coupleId: "a", points: 0.25, result: null }] }, "friend")).error).toMatch(/steps of 0.5/);
    rpc.mockResolvedValue({ data: "d1", error: null });
    expect(await saveSpecialDance(client, { episodeId: "ep", dance }, "admin")).toEqual({ error: null, result: { id: "d1" } });
    expect(await saveSpecialDancePoints(client, { episodeId: "ep", teamId: "d1", scores: [{ coupleId: "a", points: -1.5, result: "Loser" }] }, "friend")).toEqual({ error: null });
  });
});
