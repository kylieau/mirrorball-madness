import { describe, expect, it } from "vitest";
import { isJudgeArchived, judgesForScoreInputs, type ScoringJudge } from "./scoring-judges";

const carrie: ScoringJudge = { id: "cai", name: "Carrie Ann Inaba", archivedAt: null };
const derek: ScoringJudge = { id: "dh", name: "Derek Hough", archivedAt: null };
const guest: ScoringJudge = { id: "ag", name: "Anna Guest", archivedAt: "2026-09-16T00:00:00Z" };

describe("isJudgeArchived", () => {
  it("treats a null archivedAt as the standing panel", () => {
    expect(isJudgeArchived(carrie)).toBe(false);
  });

  it("treats any timestamp as archived", () => {
    expect(isJudgeArchived(guest)).toBe(true);
  });
});

describe("judgesForScoreInputs", () => {
  const panel = [carrie, derek, guest];

  it("drops archived judges from empty score boxes", () => {
    expect(judgesForScoreInputs(panel).map((j) => j.id)).toEqual(["cai", "dh"]);
  });

  it("keeps an archived judge who already scored this dance", () => {
    expect(judgesForScoreInputs(panel, ["ag"]).map((j) => j.id)).toEqual(["cai", "dh", "ag"]);
  });

  it("does not revive an archived judge just because another dance mentioned them", () => {
    expect(judgesForScoreInputs(panel, ["dh"]).map((j) => j.id)).toEqual(["cai", "dh"]);
  });
});
