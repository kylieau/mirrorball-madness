import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import { describe, expect, it, vi } from "vitest";
import { applyTeamDance, isMissingTableError, loadEpisodeTeams, overridePostedTeamMember, saveEpisodeTeams } from "./episode-teams";

type Result = { data: unknown; error: { code?: string; message: string } | null };

// A PostgREST-shaped client whose table reads resolve to the given results.
function clientWith(results: Record<string, Result>, rpc = vi.fn()) {
  const from = vi.fn((table: string) => {
    const result = results[table] ?? { data: [], error: null };
    const builder = {
      select: () => builder,
      in: () => builder,
      order: () => builder,
      then: (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve),
    };
    return builder;
  });
  return { client: { from, rpc } as unknown as SupabaseClient<Database>, from, rpc };
}

const missing = { code: "PGRST205", message: "Could not find the table 'public.episode_teams' in the schema cache" };

describe("loadEpisodeTeams", () => {
  it("reports the tables as unavailable instead of throwing before the migration is applied", async () => {
    const { client } = clientWith({ episode_teams: { data: null, error: missing }, episode_team_members: { data: null, error: missing } });
    expect(await loadEpisodeTeams(client, ["ep"])).toEqual({ available: false, teamsByEpisode: {} });
    expect(isMissingTableError({ code: "42P01", message: 'relation "public.episode_team_members" does not exist' })).toBe(true);
    expect(isMissingTableError({ code: "PGRST301", message: "JWT expired" })).toBe(false);
  });

  it("surfaces every other read error", async () => {
    const { client } = clientWith({ episode_teams: { data: null, error: { code: "500", message: "boom" } } });
    await expect(loadEpisodeTeams(client, ["ep"])).rejects.toThrow(/Could not load the episode teams/);
  });

  it("groups members under their team per episode", async () => {
    const { client } = clientWith({
      episode_teams: {
        data: [
          { id: "t1", episode_id: "ep", name: "Slaytopia", song_title: "Zoo", song_source: null, dance_style_id: "fs", captain_couple_id: "a", host_name: null, sort_order: 1 },
          { id: "t2", episode_id: "ep", name: "Wildcats", song_title: null, song_source: null, dance_style_id: "fs", captain_couple_id: null, host_name: "Julianne", sort_order: 2 },
        ],
        error: null,
      },
      episode_team_members: { data: [{ team_id: "t1", couple_id: "b" }, { team_id: "t1", couple_id: "a" }, { team_id: "t2", couple_id: "c" }], error: null },
    });
    const loaded = await loadEpisodeTeams(client, ["ep"]);
    expect(loaded.available).toBe(true);
    expect(loaded.teamsByEpisode.ep.map((t) => [t.name, t.memberCoupleIds])).toEqual([
      ["Slaytopia", ["a", "b"]],
      ["Wildcats", ["c"]],
    ]);
  });

  it("asks nothing when there are no episodes", async () => {
    const { client, from } = clientWith({});
    expect(await loadEpisodeTeams(client, [])).toEqual({ available: true, teamsByEpisode: {} });
    expect(from).not.toHaveBeenCalled();
  });
});

describe("team RPC wrappers", () => {
  it("translate a missing-table failure into the apply-the-migration message", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: missing });
    const { client } = clientWith({}, rpc);
    expect((await saveEpisodeTeams(client, { episodeId: "ep", teams: [] }, "admin")).error).toMatch(/apply-team-dances\.sql/);
    expect((await applyTeamDance(client, { episodeId: "ep", teamId: "t", marks: [] }, "admin")).error).toMatch(/apply-team-dances\.sql/);
  });

  it("refuse out-of-range marks before any round trip", async () => {
    const rpc = vi.fn();
    const { client } = clientWith({}, rpc);
    expect((await applyTeamDance(client, { episodeId: "ep", teamId: "t", marks: [{ judgeId: "j", score: 11 }] }, "admin")).error).toMatch(/between 0 and 10/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("pass the RPC's result through, including an optional couple restriction", async () => {
    const result = { applied: ["a"], posted: [], skipped: [], collisions: [] };
    const rpc = vi.fn().mockResolvedValue({ data: result, error: null });
    const { client } = clientWith({}, rpc);
    expect(await applyTeamDance(client, { episodeId: "ep", teamId: "t", marks: [{ judgeId: "j", score: 9 }], coupleIds: ["a"] }, "friend")).toEqual({ error: null, result });
    expect(rpc).toHaveBeenCalledWith("apply_team_dance", expect.objectContaining({ p_actor_id: "friend", p_couple_ids: ["a"] }));
  });
});

describe("overridePostedTeamMember", () => {
  // The snapshot and plan shapes the reveal path needs, trimmed to one week.
  const snapshot = (dances: { couple_id: string; episode_id: string }[]) => ({
    _revision: "r",
    season: { id: "s" },
    episodes: [{ id: "ep", week_id: "w", results_published_at: null }],
    weeks: [{ id: "w" }],
    couples: [],
    dances,
    draftDances: [{ id: "d", episode_id: "ep", couple_id: "a" }],
    draftJudges: [{ draft_dance_score_id: "d", score: 9 }],
    leagues: [],
    settings: [],
    rosters: [],
    weeklyScores: [],
  });

  it("stops after a failed un-post without applying or re-posting", async () => {
    const rpc = vi.fn(async (name: string) =>
      name === "episode_publication_snapshot" ? { data: snapshot([]), error: null } : { data: null, error: { message: "nope" } }
    );
    const { client } = clientWith({}, rpc);
    const outcome = await overridePostedTeamMember(client, { episodeId: "ep", teamId: "t", coupleId: "a", marks: [] }, "admin");
    expect(outcome.error).toMatch(/Could not un-post/);
    expect(rpc.mock.calls.map((c) => c[0])).not.toContain("apply_team_dance");
  });

  it("runs un-post, apply and re-post in order", async () => {
    let live = [{ couple_id: "a", episode_id: "ep" }];
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "episode_publication_snapshot") return { data: snapshot(live), error: null };
      if (name === "commit_episode_reveal") {
        live = args.p_undo ? [] : [{ couple_id: "a", episode_id: "ep" }];
        return { data: null, error: null };
      }
      if (name === "apply_team_dance") return { data: { applied: ["a"], posted: [], skipped: [], collisions: [] }, error: null };
      throw new Error(name);
    });
    const { client } = clientWith({}, rpc);
    const outcome = await overridePostedTeamMember(client, { episodeId: "ep", teamId: "t", coupleId: "a", marks: [{ judgeId: "j", score: 9 }] }, "admin");
    expect(outcome).toEqual({ error: null });
    expect(rpc.mock.calls.map((c) => c[0]).filter((n) => n !== "episode_publication_snapshot")).toEqual([
      "commit_episode_reveal",
      "apply_team_dance",
      "commit_episode_reveal",
    ]);
    expect(rpc.mock.calls.filter((c) => c[0] === "commit_episode_reveal").map((c) => c[1].p_undo)).toEqual([true, false]);
  });
});
