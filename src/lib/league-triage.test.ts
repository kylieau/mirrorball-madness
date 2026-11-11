import { describe, expect, it } from "vitest";
import {
  buildModuleStack,
  danceCardRosterNames,
  homeLeagueChrome,
  leagueTapHref,
  lifelinePickDue,
  NO_ROSTER_MOVES,
  picksAction,
  picksButtonLabel,
  showHybridStatusPill,
  type ModuleLine,
  type ModuleStackInput,
  type RosterMoves,
  type StackCouple,
} from "./league-triage";
import type { CoupleNameParts } from "./couple-display";

const LOCK = "2026-09-29T00:00:00Z";
const c = (celebrity: string, pro: string): StackCouple => ({ celebrity, pro, id: celebrity });
const joined = (parts: CoupleNameParts) => `${parts.celebrity} & ${parts.pro}`;
const base: ModuleStackInput = {
  curtainCall: { on: true, state: "open", afterWeek: 2, lockAt: LOCK, eliminatedName: null, podiumNames: null, topScorerName: null },
  danceCard: { on: true, draftStatus: "completed", roster: [{ couple: c("Ava", "Val"), out: false }, { couple: c("Jess", "Alan"), out: false }], moves: NO_ROSTER_MOVES },
  grandFinale: { on: true, open: true, locked: false, deadlineAt: LOCK, hasPrediction: false, nextElimName: null },
};
// Rows as the card reads them: text, then the couple (celebrity in bold).
const flat = (line: ModuleLine) => ({
  ...line,
  lines: line.lines.map((row) => row.text + (row.couple ? joined(row.couple) : "")),
});
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
    expect(leagueTapHref("abc", true)).toBe("/leagues/abc/picks");
    expect(leagueTapHref("abc", false)).toBe("/leagues/abc/standings");
  });
});

describe("buildModuleStack", () => {
  it("splits out every couple name so the card can set it in bold", () => {
    const stack = buildModuleStack({
      ...withCc({ eliminatedName: c("Ava", "Val"), topScorerName: c("Jess", "Alan") }),
      grandFinale: { ...base.grandFinale, hasPrediction: true, nextElimName: c("Priya", "Sasha") },
    });
    expect(stack.map((l) => l.lines)).toEqual([
      [
        { text: "Home: ", couple: c("Ava", "Val") },
        { text: "High: ", couple: c("Jess", "Alan") },
      ],
      [
        { text: "", couple: c("Ava", "Val"), struck: false },
        { text: "", couple: c("Jess", "Alan"), struck: false },
      ],
      [{ text: "Next elim: ", couple: c("Priya", "Sasha") }],
    ]);
  });

  it("lists modules in Curtain Call, Dance Card, Grand Finale order and skips modules that are off", () => {
    expect(buildModuleStack(base).map((l) => l.name)).toEqual(["Curtain Call", "Dance Card", "Grand Finale"]);
    expect(buildModuleStack(withCc({ on: false })).map((l) => l.name)).toEqual(["Dance Card", "Grand Finale"]);
  });

  describe("Curtain Call", () => {
    const line = (cc: Partial<ModuleStackInput["curtainCall"]>) => flat(buildModuleStack(withCc(cc))[0]);

    it("asks for both picks and shows when it locks", () => {
      expect(line({})).toMatchObject({
        lines: ["Need Home & High picks"],
        tone: "needed",
        locksAt: LOCK,
        locked: false,
      });
    });

    it("names what's missing when partly in", () => {
      expect(line({ eliminatedName: c("Ava", "Val") })).toMatchObject({
        lines: ["Home: Ava & Val"],
        needText: "Need High",
        tone: "normal",
      });
      expect(line({ topScorerName: c("Jess", "Alan") })).toMatchObject({
        lines: ["High: Jess & Alan"],
        needText: "Need Home",
        tone: "normal",
      });
    });

    it("puts Home and High on their own lines, still counting down to the lock", () => {
      expect(line({ eliminatedName: c("Ava", "Val"), topScorerName: c("Jess", "Alan") })).toMatchObject({
        lines: ["Home: Ava & Val", "High: Jess & Alan"],
        tone: "normal",
        locksAt: LOCK,
        locked: false,
        needText: null,
      });
    });

    it("asks for the podium in the Finale, one place a line once it's in", () => {
      expect(line({ podiumNames: [] })).toMatchObject({ lines: ["Need podium & High picks"], tone: "needed" });
      expect(line({ podiumNames: [], topScorerName: c("Jess", "Alan") })).toMatchObject({
        lines: ["High: Jess & Alan"],
        needText: "Need podium",
      });
      const podiumNames = [c("Ava", "Val"), c("Jess", "Alan"), c("Priya", "Sasha")];
      expect(line({ podiumNames })).toMatchObject({
        lines: ["Win: Ava & Val", "2nd: Jess & Alan", "3rd: Priya & Sasha"],
        needText: "Need High",
      });
      expect(line({ state: "locked", podiumNames, topScorerName: c("Ava", "Val") })).toMatchObject({
        lines: ["Win: Ava & Val", "2nd: Jess & Alan", "3rd: Priya & Sasha", "High: Ava & Val"],
        locked: true,
      });
    });

    it("marks locked, with each pick on its own line or a missed cue", () => {
      expect(line({ state: "locked", eliminatedName: c("Ava", "Val"), topScorerName: c("Jess", "Alan") })).toMatchObject({
        lines: ["Home: Ava & Val", "High: Jess & Alan"],
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
    const line = (draftStatus: string, couples: StackCouple[] = []) =>
      flat(buildModuleStack({ ...base, danceCard: { on: true, draftStatus, roster: couples.map((couple) => ({ couple, out: false })), moves: NO_ROSTER_MOVES } })[1]);

    it("reports draft status, then each couple on its own line", () => {
      expect(line("not_started")).toMatchObject({ lines: ["Draft not started"], locked: false });
      expect(line("in_progress")).toMatchObject({ lines: ["Draft in progress"], locked: false });
      expect(line("completed", [])).toMatchObject({ lines: ["No couples"], locked: true });
      expect(line("completed", [c("Tatyana", "Jan"), c("Jordan S.", "Alan"), c("Sarah Jane", "Hailey")])).toMatchObject({
        lines: ["Tatyana & Jan", "Jordan S. & Alan", "Sarah Jane & Hailey"],
        locked: true,
      });
    });

    it("strikes a couple that is out, keeping it in its place", () => {
      const roster = [
        { couple: c("Tatyana", "Jan"), out: false },
        { couple: c("Julia", "Ezra"), out: true },
      ];
      const rows = buildModuleStack({ ...base, danceCard: { on: true, draftStatus: "completed", roster, moves: NO_ROSTER_MOVES } })[1].lines;
      expect(rows.map((row) => [row.couple?.celebrity, row.struck])).toEqual([["Tatyana", false], ["Julia", true]]);
    });

    describe("roster moves", () => {
      const NOW = new Date("2026-11-17T20:00:00Z");
      const IN_5H = "2026-11-18T01:00:00Z";
      const IN_2D = "2026-11-19T20:00:00Z";
      const IN_20H = "2026-11-18T16:00:00Z";
      // Each move as the card reads it: its mark, its words, its clock.
      const moves = (parts: Partial<RosterMoves<StackCouple>>, draftStatus = "completed") =>
        buildModuleStack(
          { ...base, danceCard: { ...base.danceCard, draftStatus, moves: { ...NO_ROSTER_MOVES, ...parts } } },
          NOW
        )[1].moves.map((row) => [
          row.mark,
          row.text + (row.couple ? joined(row.couple) : "") + (row.after ?? ""),
          row.clock,
        ]);

      it("has none for a league with nothing on, and never before the draft is done", () => {
        expect(moves({})).toEqual([]);
        expect(moves({ waivers: { adds: [], openSpotCount: 1, dueAt: IN_2D } }, "in_progress")).toEqual([]);
        expect(buildModuleStack(base).every((line) => line.moves.length === 0)).toBe(true);
      });

      it("asks for whatever still needs the manager, each with its own clock", () => {
        expect(
          moves({
            lifeline: { picks: [null], lockAt: IN_5H, locked: false },
            waivers: { adds: [], openSpotCount: 1, dueAt: IN_2D },
            trades: { offerExpiries: [IN_2D, IN_20H], acceptedWith: [] },
          })
        ).toEqual([
          ["needed", "Need Lifeline pick", "Locks in 5h"],
          ["needed", "1 open spot", "Runs in 2d"],
          ["needed", "2 trade offers", "Ends in 20h"],
        ]);
      });

      it("confirms what is saved: a Lifeline is settled, a claim and a trade wait on the run", () => {
        expect(
          moves({
            lifeline: { picks: [c("Maura", "Mark")], lockAt: IN_5H, locked: false },
            waivers: { adds: [c("Tatyana", "Jan"), c("Jo", "Ezra"), c("Alix", "Val")], openSpotCount: 1, dueAt: null },
            trades: { offerExpiries: [], acceptedWith: [["Kim"], ["Kim", "Pat"], ["Kim", "Pat", "Lou"]] },
          })
        ).toEqual([
          ["saved", "Lifeline: Maura & Mark", "Locks in 5h"],
          ["waiting", "Add Tatyana & Jan, +2 more", "After results"],
          ["waiting", "Trade with Kim", "At the run"],
          ["waiting", "Trade with Kim and Pat", "At the run"],
          ["waiting", "Trade with 3 managers", "At the run"],
        ]);
      });

      it("puts a missing Lifeline above a saved one, with the lock on the first line only", () => {
        const picks = [c("Maura", "Mark"), null, null];
        expect(moves({ lifeline: { picks, lockAt: IN_5H, locked: false } })).toEqual([
          ["needed", "Need 2 Lifeline picks", "Locks in 5h"],
          ["saved", "Lifeline: Maura & Mark", null],
        ]);
        expect(moves({ lifeline: { picks, lockAt: IN_5H, locked: true } })).toEqual([
          ["missed", "No Lifeline picks", "Locked"],
          ["saved", "Lifeline: Maura & Mark", null],
        ]);
      });

      it("says nothing about waivers with no claim and no open spot, and never counts down a run that is due", () => {
        expect(moves({ waivers: { adds: [], openSpotCount: 0, dueAt: IN_2D } })).toEqual([]);
        expect(moves({ waivers: { adds: [], openSpotCount: 2, dueAt: "2026-11-17T19:55:00Z" } })).toEqual([
          ["needed", "2 open spots", "Runs soon"],
        ]);
      });
    });
  });

  describe("Grand Finale", () => {
    const line = (gf: Partial<ModuleStackInput["grandFinale"]>) => flat(buildModuleStack(withGf(gf))[2]);

    it("asks for a prediction until the deadline, then marks a missed cue", () => {
      expect(line({})).toMatchObject({ lines: ["Need predictions"], tone: "needed", locksAt: LOCK });
      expect(line({ open: false, locked: true })).toMatchObject({
        lines: ["Missed your cue"],
        tone: "dim",
        locked: true,
      });
    });

    it("shows the next predicted elimination, or just that it's in", () => {
      expect(line({ hasPrediction: true, nextElimName: c("Priya", "Sasha") })).toMatchObject({
        lines: ["Next elim: Priya & Sasha"],
        locked: false,
        locksAt: LOCK,
      });
      expect(line({ hasPrediction: true, locked: true, open: false }).lines).toEqual(["Prediction in"]);
      expect(line({ hasPrediction: true, locked: true, open: false })).toMatchObject({ locked: true, locksAt: null });
    });
  });
});

describe("lifelinePickDue", () => {
  it("is due only while a dead spot has no Lifeline and the lock hasn't passed", () => {
    const lifeline = { picks: ["a", null], lockAt: LOCK, locked: false };
    expect(lifelinePickDue({ ...NO_ROSTER_MOVES, lifeline })).toBe(true);
    expect(lifelinePickDue({ ...NO_ROSTER_MOVES, lifeline: { ...lifeline, locked: true } })).toBe(false);
    expect(lifelinePickDue({ ...NO_ROSTER_MOVES, lifeline: { ...lifeline, picks: ["a", "b"] } })).toBe(false);
    expect(
      lifelinePickDue({ ...NO_ROSTER_MOVES, waivers: { adds: [], openSpotCount: 1, dueAt: null }, trades: { offerExpiries: [LOCK], acceptedWith: [] } })
    ).toBe(false);
  });
});

describe("danceCardRosterNames", () => {
  const names = (...args: Parameters<typeof danceCardRosterNames>) => danceCardRosterNames(...args).map((r) => joined(r.couple));
  const couples = [
    { id: "1", celebrityName: "Tatyana Ali", proName: "Jan Ravnik", out: false },
    { id: "2", celebrityName: "Jordan Smith", proName: "Alan Bersten", out: false },
    { id: "3", celebrityName: "Jordan Chiles", proName: "Val Chmerkovskiy", out: true },
  ];

  it("carries whether each couple is out", () => {
    expect(danceCardRosterNames(["1", "3"], couples).map((r) => r.out)).toEqual([false, true]);
  });

  it("uses first names for both partners, in slot order", () => {
    expect(names(["3", "1"], couples)).toEqual(["Jordan C. & Val", "Tatyana & Jan"]);
  });

  it("disambiguates a shared first name the same way couple display names do", () => {
    expect(names(["2", "3"], couples)).toEqual(["Jordan S. & Alan", "Jordan C. & Val"]);
  });

  it("keeps a compound first name together", () => {
    expect(
      names(["4"], [{ id: "4", celebrityName: "Sarah Jane Nader", proName: "Hailey Bills", out: false }])
    ).toEqual(["Sarah Jane & Hailey"]);
  });

  it("drops a slot whose couple is missing", () => {
    expect(names(["missing", "1"], couples)).toEqual(["Tatyana & Jan"]);
  });
});

describe("home hybrid chrome", () => {
  it("hides Manage and keeps create/join quiet for one league", () => {
    expect(homeLeagueChrome(1)).toEqual({ showManage: false, quietCreateJoin: true });
  });

  it("shows Manage and leaves create/join off Home once there are two leagues", () => {
    expect(homeLeagueChrome(2)).toEqual({ showManage: true, quietCreateJoin: false });
    expect(homeLeagueChrome(4).showManage).toBe(true);
  });

  it("shows a due or weeks-behind pill and hides the caught-up pill", () => {
    expect(showHybridStatusPill(true, 0)).toBe(true);
    expect(showHybridStatusPill(false, 2)).toBe(true);
    expect(showHybridStatusPill(false, 0)).toBe(false);
  });

  it("offers See Picks when picks are locked", () => {
    expect(picksButtonLabel("make")).toBe("Make Picks");
    expect(picksButtonLabel("locked")).toBe("See Picks");
    expect(picksButtonLabel("edit")).toBe("Edit Picks");
    expect(picksButtonLabel("none")).toBeNull();
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
