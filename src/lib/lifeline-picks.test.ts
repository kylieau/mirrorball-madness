import { describe, expect, it } from "vitest";
import { lifelinePicksState, lifelineSaveSteps, type LifelineRosterSlot } from "./lifeline-picks";

const dancing: LifelineRosterSlot = { slotNumber: 1, coupleId: "star", status: "active", eliminationWeek: null };
const out: LifelineRosterSlot = { slotNumber: 2, coupleId: "out", status: "eliminated", eliminationWeek: 4 };
const state = (slots: LifelineRosterSlot[], overrides = {}) =>
  lifelinePicksState({ slots, weekNumber: 6, behind: false, peersHavePicks: false, ...overrides });

describe("lifelinePicksState", () => {
  it("offers a Lifeline for each spot whose couple went home in an earlier week", () => {
    expect(state([dancing, out])).toEqual({ kind: "play", slots: [out] });
    expect(state([dancing, { ...out, status: "withdrawn" }]).kind).toBe("play");
  });

  it("shows nothing for a full roster or a couple going home this week", () => {
    expect(state([dancing])).toEqual({ kind: "none" });
    expect(state([dancing, { ...out, eliminationWeek: 6 }])).toEqual({ kind: "none" });
    expect(state([])).toEqual({ kind: "none" });
  });

  it("gives a viewer who is behind the same catch-up state with or without a dead spot", () => {
    expect(state([dancing, out], { behind: true })).toEqual({ kind: "catch-up" });
    expect(state([dancing], { behind: true, peersHavePicks: true })).toEqual({ kind: "catch-up" });
  });

  it("keeps the card for the league's picks when the viewer has no dead spot", () => {
    expect(state([dancing], { peersHavePicks: true })).toEqual({ kind: "play", slots: [] });
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
