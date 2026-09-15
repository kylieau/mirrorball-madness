import { describe, expect, it } from "vitest";
import { resolveEpisodeCoupleIds } from "./episode-participants";

describe("resolveEpisodeCoupleIds", () => {
  it("returns every active couple when no participants are configured", () => {
    expect(resolveEpisodeCoupleIds(["a", "b", "c"], [])).toEqual(["a", "b", "c"]);
  });

  it("filters down to just the configured participants", () => {
    expect(resolveEpisodeCoupleIds(["a", "b", "c"], ["b"])).toEqual(["b"]);
  });

  it("excludes a participant id that's no longer active", () => {
    expect(resolveEpisodeCoupleIds(["a", "b"], ["b", "c"])).toEqual(["b"]);
  });
});
