import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import { getAccountSettingsData } from "./account-settings-data";

vi.mock("./viewer-season-data", () => ({ loadViewerMemberships: vi.fn().mockResolvedValue([]) }));

function client(data: unknown, error: unknown = null) {
  const query = { select: () => query, eq: () => query, single: async () => ({ data, error }) };
  return { from: () => query } as unknown as SupabaseClient<Database>;
}

describe("account preference read failures", () => {
  it("does not disable spoiler protection on a failed or missing profile", async () => {
    await expect(getAccountSettingsData(client(null, { code: "PGRST003" }), "viewer")).rejects.toThrow(/preferences/);
    await expect(getAccountSettingsData(client(null), "viewer")).rejects.toThrow(/preferences/);
  });
  it("preserves the viewer's actual setting after a successful read", async () => {
    for (const mode of [true, false]) {
      expect((await getAccountSettingsData(client({ spoiler_free_mode: mode }), "viewer")).spoilerFreeMode).toBe(mode);
    }
  });
});
