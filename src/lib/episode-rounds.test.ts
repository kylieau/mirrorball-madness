import { describe, expect, it } from "vitest";
import {
  draftsWithException,
  exceptionsAfter,
  exceptionStatus,
  heatName,
  individualRoundDraft,
  newRoundDraft,
  nightException,
  ownSlotIndex,
  pairingChecks,
  resizeUnits,
  roundDraftFrom,
  roundsPayload,
  roundTabLabel,
  roundUnits,
  rowAfterException,
  SPECIAL_ROUND_OPTIONS,
  specialModeFor,
  validateRounds,
  type EpisodeRound,
  type RoundException,
} from "./episode-rounds";
import type { SpecialDance } from "./team-dances";

const round = (overrides: Partial<EpisodeRound>): EpisodeRound => ({
  id: "r1", episodeId: "ep", position: 1, kind: "own", roundType: "Individual Dance", scoring: "marks", bonusPoints: null, unitCount: 0, ...overrides,
});
const r1 = round({});
const danceOff = round({ id: "r2", position: 2, kind: "special", roundType: "Dance-Off", scoring: "fixed_bonus", unitCount: 3 });
const second = round({ id: "r3", position: 3, kind: "own", roundType: "Second Dance" });
const dance = (overrides: Partial<SpecialDance>): SpecialDance => ({
  id: "d", episodeId: "ep", name: "Dance-Off 1", nameIsAuto: true, danceType: "Dance-Off", scoringMode: "points",
  danceStyleId: "s", secondDanceStyleId: null, songs: [], songTitle: null, details: [], captainCoupleId: null, hostName: null,
  sortOrder: 0, memberCoupleIds: [], roundId: "r2", heatNumber: 1, postedAt: null, updatedAt: null, ...overrides,
});
const names: Record<string, string> = { amber: "Amber", ezra: "Ezra", jenna: "Jenna", tatyana: "Tatyana", harry: "Harry" };

describe("round basics", () => {
  it("names heats, maps scoring to a special dance mode, labels tabs and finds own slots", () => {
    expect(heatName("Dance-Off", 2, 3)).toBe("Dance-Off 2");
    expect(heatName("Marathon", 1, 1)).toBe("Marathon");
    expect([specialModeFor("couple_marks"), specialModeFor("team_marks"), specialModeFor("fixed_bonus"), specialModeFor("ranked_points")])
      .toEqual(["couple_marks", "marks", "points", "points"]);
    expect([roundTabLabel(r1), roundTabLabel(danceOff)]).toEqual(["1 · Individual", "2 · Dance-Off"]);
    expect([ownSlotIndex([r1, danceOff, second], "r1"), ownSlotIndex([r1, danceOff, second], "r3"), ownSlotIndex([r1, danceOff, second], "r2")]).toEqual([0, 1, -1]);
  });

  it("lists a special round's heats with placeholders, keeping a heat past the plan", () => {
    const units = roundUnits(danceOff, [dance({ id: "a", heatNumber: 2, name: "Dance-Off 2" }), dance({ id: "imm", heatNumber: null, name: "Immunity" }), dance({ id: "z", heatNumber: 4, name: "Dance-Off 4" })]);
    expect(units.map((u) => [u.heatNumber, u.name, u.dance?.id ?? null])).toEqual([
      [1, "Dance-Off 1", null], [2, "Dance-Off 2", "a"], [3, "Dance-Off 3", null], [4, "Dance-Off 4", "z"],
    ]);
  });
});

describe("exceptions", () => {
  const rounds = [r1, danceOff];
  it("spans the night for Withdrawn, both ways, and reads the night's outcome", () => {
    const withdrawn = exceptionsAfter(rounds, [], { coupleId: "amber", roundIds: ["r1"], kind: "withdrawn" });
    expect(withdrawn.map((x) => x.roundId)).toEqual(["r1", "r2"]);
    expect(nightException(rounds, withdrawn, "amber")).toBe("withdrawn");
    expect(exceptionsAfter(rounds, withdrawn, { coupleId: "amber", roundIds: ["r2"], kind: null })).toEqual([]);
    const sitOut = exceptionsAfter(rounds, [], { coupleId: "ezra", roundIds: ["r1", "r2"], kind: "not_dancing", note: " Injured " });
    expect(nightException(rounds, sitOut, "ezra")).toBe("bye");
    expect(sitOut[0].note).toBe("Injured");
    expect(nightException(rounds, exceptionsAfter(rounds, [], { coupleId: "ezra", roundIds: ["r1"], kind: "not_dancing" }), "ezra")).toBeNull();
  });

  it("moves the row's outcome and Immunity box the way the SQL does", () => {
    const rounds2 = [r1, danceOff];
    const immune: RoundException[] = [{ roundId: "r2", coupleId: "harry", kind: "immune", note: null, bonusPoints: null }];
    expect(rowAfterException({ outcome: "safe", hadImmunity: false }, rounds2, [], immune, "harry", "immune")).toEqual({ outcome: "safe", hadImmunity: true });
    const bye = exceptionsAfter(rounds2, [], { coupleId: "ezra", roundIds: ["r1", "r2"], kind: "not_dancing" });
    expect(rowAfterException({ outcome: "safe", hadImmunity: false }, rounds2, [], bye, "ezra", "not_dancing").outcome).toBe("bye");
    expect(rowAfterException({ outcome: "bye", hadImmunity: false }, rounds2, bye, [], "ezra", null).outcome).toBe("safe");
    // An outcome set by hand is left alone.
    expect(rowAfterException({ outcome: "eliminated", hadImmunity: false }, rounds2, bye, [], "ezra", null).outcome).toBe("eliminated");
  });

  it("says what an exception does before it is saved", () => {
    expect(exceptionStatus({ kind: "not_dancing", coupleName: "Connor & Rylee", roundNames: [], wholeNight: true, bonus: null }))
      .toBe("Every round tonight: Connor & Rylee sit out. Their outcome saves as Did Not Dance: still in the cast, no survival bonus.");
    expect(exceptionStatus({ kind: "immune", coupleName: "Harry & Jenna", roundNames: ["Dance-Off"], wholeNight: false, bonus: 3 }))
      .toBe("Dance-Off skips Harry & Jenna. They get the 3-point bonus.");
  });
});

describe("pairing checks", () => {
  const base = { round: danceOff, castIds: ["amber", "ezra", "jenna", "tatyana", "harry"], name: (id: string) => names[id] };
  it("warns, never blocks", () => {
    expect(pairingChecks({ ...base, units: [[], [], []], exceptions: [] })[0].tone).toBe("muted");
    const checks = pairingChecks({ ...base, units: [["amber", "ezra"], ["jenna", "amber"], []], exceptions: [{ coupleId: "harry", kind: "immune" }] });
    expect(checks.map((c) => c.message)).toEqual([
      "Amber is in Dance-Off 1 and Dance-Off 2. A couple can be in one heat.",
      "Tatyana isn't in a heat yet. Pair them, or mark an exception.",
    ]);
    expect(pairingChecks({ ...base, units: [["amber", "ezra"], ["jenna", "tatyana"], []], exceptions: [{ coupleId: "harry", kind: "immune" }] }))
      .toEqual([{ tone: "ok", message: "Everyone is placed: 4 couples in 2 heats, and Harry is Immune." }]);
    expect(pairingChecks({ ...base, name: (id: string) => `${names[id]} & Pro`, units: [["amber", "ezra"], ["jenna", "tatyana"], []], exceptions: [{ coupleId: "harry", kind: "immune" }] })[0].message)
      .toBe("Everyone is placed: 4 couples in 2 heats, and Harry & Pro are Immune.");
  });
});

describe("drafts and payload", () => {
  it("builds the save_episode_rounds payload, team rounds without members", () => {
    const team = newRoundDraft(SPECIAL_ROUND_OPTIONS.find((o) => o.roundType === "Team Dance")!, "k2");
    const off = resizeUnits(newRoundDraft(SPECIAL_ROUND_OPTIONS[0], "k1"), 2);
    off.units = [["amber", "ezra"], []];
    off.bonusPoints = 3;
    const drafts = [individualRoundDraft(), off, team];
    expect(validateRounds(drafts)).toBeNull();
    expect(roundsPayload(drafts)).toEqual([
      { id: null, kind: "own", roundType: "Individual Dance", scoring: "marks", bonusPoints: null, unitCount: 0, exceptions: [] },
      { id: null, kind: "special", roundType: "Dance-Off", scoring: "fixed_bonus", bonusPoints: 3, unitCount: 2,
        heats: [{ heatNumber: 1, coupleIds: ["amber", "ezra"] }, { heatNumber: 2, coupleIds: [] }], exceptions: [] },
      { id: null, kind: "special", roundType: "Team Dance", scoring: "team_marks", bonusPoints: null, unitCount: 2, exceptions: [] },
    ]);
    expect(validateRounds([off])).toBe("Round 1 is always the Individual Dance.");
    expect(validateRounds([individualRoundDraft(), { ...off, bonusPoints: 2.25 }])).toMatch(/steps of 0.5/);
  });

  it("reads a saved round back, and marks or clears a couple on the draft", () => {
    const saved = roundDraftFrom(danceOff, [dance({ memberCoupleIds: ["amber", "ezra"] })], [{ roundId: "r2", coupleId: "harry", kind: "immune", note: null, bonusPoints: null }]);
    expect(saved.units).toEqual([["amber", "ezra"], [], []]);
    expect(saved.exceptions).toEqual([{ coupleId: "harry", kind: "immune", note: null, bonusPoints: null }]);
    const r1Draft = { ...individualRoundDraft(), id: "r1", key: "r1" };
    const out = draftsWithException([r1Draft, saved], "r2", "amber", { kind: "withdrawn", note: null, bonusPoints: null });
    expect(out.map((d) => d.exceptions.filter((x) => x.coupleId === "amber").map((x) => x.kind))).toEqual([["withdrawn"], ["withdrawn"]]);
    expect(out[1].units).toEqual([["ezra"], [], []]);
    const cleared = draftsWithException(out, "r1", "amber", null);
    expect(cleared.flatMap((d) => d.exceptions.filter((x) => x.coupleId === "amber"))).toEqual([]);
    // Immune is for special rounds only.
    expect(draftsWithException([r1Draft], "r1", "harry", { kind: "immune", note: null, bonusPoints: null })[0].exceptions).toEqual([]);
  });
});
