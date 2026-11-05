import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import { describe, expect, it, vi } from "vitest";
import { loadEpisodeRounds, saveRoundException, setRoundBonus } from "./episode-rounds-data";
import { saveTeamCoupleMarks } from "./episode-teams";

type Result = { data: unknown; error: { message: string } | null };

function clientWith(results: Record<string, Result>, rpc = vi.fn().mockResolvedValue({ data: null, error: null })) {
  const from = vi.fn((table: string) => {
    const builder = {
      select: () => builder,
      in: () => builder,
      order: () => builder,
      then: (resolve: (value: Result) => unknown) => Promise.resolve(results[table] ?? { data: [], error: null }).then(resolve),
    };
    return builder;
  });
  return { client: { from, rpc } as unknown as SupabaseClient<Database>, from, rpc };
}

describe("loadEpisodeRounds", () => {
  it("reads rounds with the user's client and exceptions with the service client, grouped by episode", async () => {
    const user = clientWith({
      episode_rounds: {
        data: [{ id: "r2", episode_id: "ep", position: 2, kind: "special", round_type: "Dance-Off", scoring: "fixed_bonus", bonus_points: "3", unit_count: 3 }],
        error: null,
      },
    });
    const admin = clientWith({
      episode_round_exceptions: {
        data: [{ round_id: "r2", episode_id: "ep", couple_id: "harry", kind: "immune", note: "Top score", bonus_points: null }],
        error: null,
      },
    });
    const loaded = await loadEpisodeRounds(user.client, admin.client, ["ep"]);
    expect(loaded.roundsByEpisode.ep).toEqual([
      { id: "r2", episodeId: "ep", position: 2, kind: "special", roundType: "Dance-Off", scoring: "fixed_bonus", bonusPoints: 3, unitCount: 3 },
    ]);
    expect(loaded.exceptionsByEpisode.ep).toEqual([{ roundId: "r2", coupleId: "harry", kind: "immune", note: "Top score", bonusPoints: null }]);
    expect(user.from).toHaveBeenCalledWith("episode_rounds");
    expect(user.from).not.toHaveBeenCalledWith("episode_round_exceptions");
    expect(admin.from).toHaveBeenCalledWith("episode_round_exceptions");
    expect(await loadEpisodeRounds(user.client, admin.client, [])).toEqual({ roundsByEpisode: {}, exceptionsByEpisode: {} });
  });
});

describe("round RPC wrappers", () => {
  it("pass the actor and arguments the SQL expects", async () => {
    const { client, rpc } = clientWith({});
    await saveRoundException(client, { episodeId: "ep", coupleId: "c", roundIds: ["r1", "r2"], kind: "not_dancing", note: "Injured", bonusPoints: null }, "actor");
    expect(rpc).toHaveBeenLastCalledWith("save_round_exception", {
      p_episode_id: "ep", p_actor_id: "actor", p_couple_id: "c", p_round_ids: ["r1", "r2"], p_kind: "not_dancing", p_note: "Injured", p_bonus: null,
    });
    await setRoundBonus(client, { episodeId: "ep", roundId: "r2", bonusPoints: 3 }, "actor");
    expect(rpc).toHaveBeenLastCalledWith("set_round_bonus", { p_episode_id: "ep", p_actor_id: "actor", p_round_id: "r2", p_bonus: 3 });
    await saveTeamCoupleMarks(client, { episodeId: "ep", teamId: "t", coupleId: "c", marks: [{ judgeId: "j", score: 9 }] }, "actor");
    expect(rpc).toHaveBeenLastCalledWith("save_team_couple_marks", {
      p_episode_id: "ep", p_team_id: "t", p_actor_id: "actor", p_couple_id: "c", p_marks: [{ judgeId: "j", score: 9 }],
    });
  });

  it("refuses an out-of-range mark before the round trip and surfaces RPC errors", async () => {
    const { client, rpc } = clientWith({}, vi.fn().mockResolvedValue({ data: null, error: { message: "Un-post Dance-Off 1 before changing the winner's bonus" } }));
    expect((await saveTeamCoupleMarks(client, { episodeId: "ep", teamId: "t", coupleId: "c", marks: [{ judgeId: "j", score: 0 }] }, "a")).error)
      .toMatch(/whole numbers from 1 to 10/);
    expect(rpc).not.toHaveBeenCalled();
    expect((await setRoundBonus(client, { episodeId: "ep", roundId: "r", bonusPoints: 2 }, "a")).error).toMatch(/Un-post Dance-Off 1/);
  });
});
