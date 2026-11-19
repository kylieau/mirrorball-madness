import { describe, expect, it } from "vitest";
import { lifelinePicksState, lifelineSaveSteps, type LifelineRosterSlot } from "./lifeline-picks";

const dancing: LifelineRosterSlot = { slotNumber: 1, coupleId: "star", status: "active", eliminationWeek: null, startWeek: 1, endWeek: null };
const out: LifelineRosterSlot = { slotNumber: 2, coupleId: "out", status: "eliminated", eliminationWeek: 4, startWeek: 1, endWeek: null };
const state = (slots: LifelineRosterSlot[], overrides = {}) =>
  lifelinePicksState({ slots, rosterSize: 2, weekNumber: 6, behind: false, peersHavePicks: false, ...overrides });

describe("lifelinePicksState", () => {
  it("offers a Lifeline for each spot whose couple went home in an earlier week", () => {
    expect(state([dancing, out])).toEqual({ kind: "play", spots: [{ slotNumber: 2, formerCoupleId: "out" }] });
    expect(state([dancing, { ...out, status: "withdrawn" }]).kind).toBe("play");
  });

  it("offers one for a spot a trade emptied, standing in for the couple that left it", () => {
    const traded = { ...out, status: "active", eliminationWeek: null, endWeek: 4 };
    expect(state([dancing, traded])).toEqual({ kind: "play", spots: [{ slotNumber: 2, formerCoupleId: "out" }] });
    // Refilled from Week 6, or refilled with a couple that went home since.
    expect(state([dancing, traded, { ...dancing, slotNumber: 2, coupleId: "new", startWeek: 6 }])).toEqual({ kind: "none" });
    expect(state([dancing, traded, { ...out, coupleId: "new", startWeek: 5 }]).kind).toBe("play");
    // A claim that starts later leaves the spot open this week.
    expect(state([dancing, traded, { ...dancing, slotNumber: 2, coupleId: "new", startWeek: 7 }])).toEqual({
      kind: "play",
      spots: [{ slotNumber: 2, formerCoupleId: "out" }],
    });
  });

  it("names the latest couple to leave a spot, and none for a spot never held", () => {
    const first = { ...out, status: "active", eliminationWeek: null, endWeek: 2 };
    const second = { ...first, coupleId: "second", startWeek: 3, endWeek: 4 };
    expect(state([dancing, second, first])).toEqual({ kind: "play", spots: [{ slotNumber: 2, formerCoupleId: "second" }] });
    expect(state([dancing], { rosterSize: 2 })).toEqual({ kind: "play", spots: [{ slotNumber: 2, formerCoupleId: null }] });
  });

  it("shows nothing for a full roster or a couple going home this week", () => {
    expect(state([dancing], { rosterSize: 1 })).toEqual({ kind: "none" });
    expect(state([dancing, { ...out, eliminationWeek: 6 }])).toEqual({ kind: "none" });
    expect(state([])).toEqual({ kind: "none" });
  });

  it("gives a viewer who is behind the same catch-up state with or without a dead spot", () => {
    expect(state([dancing, out], { behind: true })).toEqual({ kind: "catch-up" });
    expect(state([dancing], { rosterSize: 1, behind: true, peersHavePicks: true })).toEqual({ kind: "catch-up" });
  });

  it("keeps the card for the league's picks when the viewer has no dead spot", () => {
    expect(state([dancing], { rosterSize: 1, peersHavePicks: true })).toEqual({ kind: "play", spots: [] });
  });
});

describe("lifelineSaveSteps", () => {
  it("sets one changed spot without clearing it first", () => {
    expect(lifelineSaveSteps([{ slotNumber: 2, coupleId: "star" }])).toEqual({
      clear: [],
      set: [{ slotNumber: 2, coupleId: "star" }],
    });
  });

  it("clears every changed spot before setting several, so two spots can trade couples", () => {
    expect(
      lifelineSaveSteps([
        { slotNumber: 1, coupleId: "b" },
        { slotNumber: 2, coupleId: "a" },
      ])
    ).toEqual({
      clear: [1, 2],
      set: [
        { slotNumber: 1, coupleId: "b" },
        { slotNumber: 2, coupleId: "a" },
      ],
    });
  });

  it("clears a spot whose pick was removed", () => {
    expect(
      lifelineSaveSteps([
        { slotNumber: 1, coupleId: null },
        { slotNumber: 2, coupleId: "a" },
      ])
    ).toEqual({ clear: [1], set: [{ slotNumber: 2, coupleId: "a" }] });
  });
});
