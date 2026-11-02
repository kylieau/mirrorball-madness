import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import { describe, expect, it, vi } from "vitest";
import { saveDraftResults, type SaveDraftResultsInput } from "./results-draft";

const input: SaveDraftResultsInput = {
  episodeId: "ep",
  guestJudgeName: null,
  judgesSaveAvailable: false,
  updatedBy: "friend",
  inJeopardyCoupleIds: [],
  entries: [
    { coupleId: "amber", dances: [{ danceStyleId: "s", songTitle: null, judgeScores: [{ judgeId: "j", score: 9 }] }], outcome: "safe", savedByJudges: false, hadImmunity: false, bonusPoints: 0, bonusNote: null },
    { coupleId: "julia", dances: [], outcome: "safe", savedByJudges: false, hadImmunity: false, bonusPoints: 0, bonusNote: null },
  ],
};

describe("saveDraftResults", () => {
  it("reports which couples the checked RPC wrote and which it refused as posted", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { acknowledged: ["julia"], skippedPosted: ["amber"] }, error: null });
    const admin = { rpc } as unknown as SupabaseClient<Database>;
    expect(await saveDraftResults(admin, input)).toEqual({ error: null, acknowledgedIds: ["julia"], skippedPostedIds: ["amber"] });
    expect(rpc).toHaveBeenCalledWith("save_episode_draft_checked", { p_input: input });
  });

  it("falls back to the legacy RPC only while the checked one is not installed", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "Could not find the function" } })
      .mockResolvedValueOnce({ data: null, error: null });
    const admin = { rpc } as unknown as SupabaseClient<Database>;
    expect(await saveDraftResults(admin, input)).toEqual({ error: null, acknowledgedIds: ["amber", "julia"], skippedPostedIds: [] });
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["save_episode_draft_checked", "save_episode_draft"]);
  });

  it("surfaces any other checked-save error without retrying", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "P0001", message: "Not authorized to enter results" } });
    const admin = { rpc } as unknown as SupabaseClient<Database>;
    expect(await saveDraftResults(admin, input)).toEqual({ error: "Not authorized to enter results", acknowledgedIds: [], skippedPostedIds: [] });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects out-of-range marks before any round trip", async () => {
    const rpc = vi.fn();
    const admin = { rpc } as unknown as SupabaseClient<Database>;
    const bad = { ...input, entries: [{ ...input.entries[0], dances: [{ danceStyleId: "s", songTitle: null, judgeScores: [{ judgeId: "j", score: 11 }] }] }] };
    expect((await saveDraftResults(admin, bad)).error).toMatch(/between 0 and 10/);
    expect(rpc).not.toHaveBeenCalled();
  });
});
