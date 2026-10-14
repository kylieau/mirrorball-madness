import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import { describe, expect, it, vi } from "vitest";
import { publishEpisodeAtomically } from "./episode-publication";

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
