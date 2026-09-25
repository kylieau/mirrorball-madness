import { describe, expect, it } from "vitest";
import { buildModuleStack, leagueTapHref, picksAction, type ModuleStackInput } from "./league-triage";

const LOCK = "2026-09-29T00:00:00Z";
const base: ModuleStackInput = {
  curtainCall: { on: true, state: "open", afterWeek: 2, lockAt: LOCK, eliminatedName: null, topScorerName: null },
  danceCard: { on: true, draftStatus: "completed", rosterNames: ["Ava", "Jess"] },
  grandFinale: { on: true, open: true, locked: false, deadlineAt: LOCK, hasPrediction: false, nextElimName: null },
};
const withCc = (cc: Partial<ModuleStackInput["curtainCall"]>): ModuleStackInput => ({
  ...base,
  curtainCall: { ...base.curtainCall, ...cc },
});
const withGf = (gf: Partial<ModuleStackInput["grandFinale"]>): ModuleStackInput => ({
  ...base,
  grandFinale: { ...base.grandFinale, ...gf },
});

describe("leagueTapHref", () => {
  it("opens Picks when picks are due and Standings otherwise", () => {
    expect(leagueTapHref("abc", true)).toBe("/leagues/abc?tab=yourpicks");
    expect(leagueTapHref("abc", false)).toBe("/leagues/abc?tab=standings");
  });
});

describe("buildModuleStack", () => {
  it("lists modules in Curtain Call, Dance Card, Grand Finale order and skips modules that are off", () => {
    expect(buildModuleStack(base).map((l) => l.name)).toEqual(["Curtain Call", "Dance Card", "Grand Finale"]);
    expect(buildModuleStack(withCc({ on: false })).map((l) => l.name)).toEqual(["Dance Card", "Grand Finale"]);
  });

  describe("Curtain Call", () => {
    const line = (cc: Partial<ModuleStackInput["curtainCall"]>) => buildModuleStack(withCc(cc))[0];

    it("asks for both picks and shows when it locks", () => {
      expect(line({})).toMatchObject({ text: "Need Home & High picks", tone: "needed", locksAt: LOCK, locked: false });
    });

    it("names what's missing when partly in", () => {
      expect(line({ eliminatedName: "Ava" })).toMatchObject({ text: "Home: Ava", needText: "Need High", tone: "normal" });
      expect(line({ topScorerName: "Jess" })).toMatchObject({ text: "High: Jess", needText: "Need Home", tone: "normal" });
    });

    it("shows the picks once complete, still counting down to the lock", () => {
      expect(line({ eliminatedName: "Ava", topScorerName: "Jess" })).toMatchObject({
        text: "Home: Ava / High: Jess",
        tone: "normal",
        locksAt: LOCK,
        locked: false,
      });
    });

    it("marks locked, with picks or a missed cue", () => {
      expect(line({ state: "locked", eliminatedName: "Ava", topScorerName: "Jess" })).toMatchObject({
        text: "Home: Ava / High: Jess",
        locked: true,
      });
      expect(line({ state: "locked" })).toMatchObject({ text: "Missed your cue", tone: "dim", locked: true });
    });

    it("explains why it isn't open yet", () => {
      expect(line({ state: "awaiting_results" }).text).toBe("Opens after Week 2 results");
      expect(line({ state: "awaiting_results", afterWeek: null }).text).toBe("Opens after results");
      expect(line({ state: "no_week" }).text).toBe("Not open yet");
    });
  });

  describe("Dance Card", () => {
    const line = (draftStatus: string, rosterNames: string[] = []) =>
      buildModuleStack({ ...base, danceCard: { on: true, draftStatus, rosterNames } })[1];

    it("reports draft status, then the locked roster", () => {
      expect(line("not_started")).toMatchObject({ text: "Draft not started", locked: false });
      expect(line("in_progress")).toMatchObject({ text: "Draft in progress", locked: false });
      expect(line("completed", ["Ava", "Jess"])).toMatchObject({ text: "Ava, Jess", locked: true });
    });
  });

  describe("Grand Finale", () => {
    const line = (gf: Partial<ModuleStackInput["grandFinale"]>) => buildModuleStack(withGf(gf))[2];

    it("asks for a prediction until the deadline, then marks a missed cue", () => {
      expect(line({})).toMatchObject({ text: "Need predictions", tone: "needed", locksAt: LOCK });
      expect(line({ open: false, locked: true })).toMatchObject({ text: "Missed your cue", tone: "dim", locked: true });
    });

    it("shows the next predicted elimination, or just that it's in", () => {
      expect(line({ hasPrediction: true, nextElimName: "Priya" })).toMatchObject({
        text: "Next elim: Priya",
        locked: false,
        locksAt: LOCK,
      });
      expect(line({ hasPrediction: true, locked: true, open: false }).text).toBe("Prediction in");
      expect(line({ hasPrediction: true, locked: true, open: false })).toMatchObject({ locked: true, locksAt: null });
    });
  });
});

describe("picksAction", () => {
  const shut = { curtainCall: { ...base.curtainCall, state: "locked" as const }, grandFinale: { ...base.grandFinale, open: false, locked: true } };

  it("is Make when picks are due", () => {
    expect(picksAction(true, base)).toBe("make");
  });

  it("is Edit while a pick module is open, Locked once shut", () => {
    expect(picksAction(false, base)).toBe("edit");
    expect(picksAction(false, shut)).toBe("locked");
  });

  it("stays Edit if one module is locked but another is open", () => {
    expect(picksAction(false, { ...shut, grandFinale: base.grandFinale })).toBe("edit");
  });

  it("is none when nothing is open or locked yet, or no pick module is on", () => {
    const waiting = { curtainCall: { ...base.curtainCall, state: "awaiting_results" as const }, grandFinale: { ...base.grandFinale, on: false } };
    expect(picksAction(false, waiting)).toBe("none");
    const off = { curtainCall: { ...base.curtainCall, on: false }, grandFinale: { ...base.grandFinale, on: false } };
    expect(picksAction(false, off)).toBe("none");
  });
});
