import { describe, expect, it } from "vitest";
import { SCORING_MODULES, scoringModule } from "./scoring-modules";

describe("SCORING_MODULES", () => {
  it("lists the weekly module first and the one-time finale last", () => {
    expect(SCORING_MODULES.map((m) => m.key)).toEqual(["curtainCall", "danceCard", "grandFinale"]);
  });

  it("looks a module up by key", () => {
    expect(scoringModule("danceCard").name).toBe("Dance Card");
  });
});
