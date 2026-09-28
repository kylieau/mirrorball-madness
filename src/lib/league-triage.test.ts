import { describe, expect, it } from "vitest";
import {
  buildModuleStack,
  danceCardRosterNames,
  leagueTapHref,
  picksAction,
  type ModuleStackInput,
} from "./league-triage";

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
      expect(line({})).toMatchObject({
        lines: ["Need Home & High picks"],
        tone: "needed",
        locksAt: LOCK,
        locked: false,
      });
    });

    it("names what's missing when partly in", () => {
      expect(line({ eliminatedName: "Ava" })).toMatchObject({
        lines: ["Home: Ava"],
        needText: "Need High",
        tone: "normal",
      });
      expect(line({ topScorerName: "Jess" })).toMatchObject({
        lines: ["High: Jess"],
        needText: "Need Home",
        tone: "normal",
      });
    });

    it("puts Home and High on their own lines, still counting down to the lock", () => {
      expect(line({ eliminatedName: "Ava", topScorerName: "Jess" })).toMatchObject({
        lines: ["Home: Ava", "High: Jess"],
        tone: "normal",
        locksAt: LOCK,
        locked: false,
        needText: null,
      });
    });

    it("marks locked, with each pick on its own line or a missed cue", () => {
      expect(line({ state: "locked", eliminatedName: "Ava", topScorerName: "Jess" })).toMatchObject({
        lines: ["Home: Ava", "High: Jess"],
        locked: true,
      });
      expect(line({ state: "locked" })).toMatchObject({ lines: ["Missed your cue"], tone: "dim", locked: true });
    });

    it("explains why it isn't open yet", () => {
      expect(line({ state: "awaiting_results" }).lines).toEqual(["Opens after Week 2 results"]);
      expect(line({ state: "awaiting_results", afterWeek: null }).lines).toEqual(["Opens after results"]);
      expect(line({ state: "no_week" }).lines).toEqual(["Not open yet"]);
    });
  });

  describe("Dance Card", () => {
    const line = (draftStatus: string, rosterNames: string[] = []) =>
      buildModuleStack({ ...base, danceCard: { on: true, draftStatus, rosterNames } })[1];

    it("reports draft status, then each couple on its own line", () => {
      expect(line("not_started")).toMatchObject({ lines: ["Draft not started"], locked: false });
      expect(line("in_progress")).toMatchObject({ lines: ["Draft in progress"], locked: false });
      expect(line("completed", [])).toMatchObject({ lines: ["No couples"], locked: true });
      expect(
        line("completed", ["Tatyana Ali & Jan Ravnik", "Jordan Smith & Alan Bersten", "Sarah Jane Nader & Hailey Bills"])
      ).toMatchObject({
        lines: ["Tatyana Ali & Jan Ravnik", "Jordan Smith & Alan Bersten", "Sarah Jane Nader & Hailey Bills"],
        locked: true,
      });
    });
  });

  describe("Grand Finale", () => {
    const line = (gf: Partial<ModuleStackInput["grandFinale"]>) => buildModuleStack(withGf(gf))[2];

    it("asks for a prediction until the deadline, then marks a missed cue", () => {
      expect(line({})).toMatchObject({ lines: ["Need predictions"], tone: "needed", locksAt: LOCK });
      expect(line({ open: false, locked: true })).toMatchObject({
        lines: ["Missed your cue"],
        tone: "dim",
        locked: true,
      });
    });

    it("shows the next predicted elimination, or just that it's in", () => {
      expect(line({ hasPrediction: true, nextElimName: "Priya" })).toMatchObject({
        lines: ["Next elim: Priya"],
        locked: false,
        locksAt: LOCK,
      });
      expect(line({ hasPrediction: true, locked: true, open: false }).lines).toEqual(["Prediction in"]);
      expect(line({ hasPrediction: true, locked: true, open: false })).toMatchObject({ locked: true, locksAt: null });
    });
  });
});

describe("danceCardRosterNames", () => {
  const couples = [
    { id: "1", celebrityName: "Tatyana Ali", proName: "Jan Ravnik" },
    { id: "2", celebrityName: "Jordan Smith", proName: "Alan Bersten" },
    { id: "3", celebrityName: "Jordan Chiles", proName: "Val Chmerkovskiy" },
  ];

  it("keeps each couple's full celebrity and pro name, in slot order", () => {
    expect(danceCardRosterNames(["3", "1"], couples)).toEqual([
      "Jordan Chiles & Val Chmerkovskiy",
      "Tatyana Ali & Jan Ravnik",
    ]);
  });

  it("does not shorten a shared first name to a last initial", () => {
    expect(danceCardRosterNames(["2", "3"], couples)).toEqual([
      "Jordan Smith & Alan Bersten",
      "Jordan Chiles & Val Chmerkovskiy",
    ]);
  });

  it("drops a slot whose couple is missing", () => {
    expect(danceCardRosterNames(["missing", "1"], couples)).toEqual(["Tatyana Ali & Jan Ravnik"]);
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
