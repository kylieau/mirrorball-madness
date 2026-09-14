import { describe, expect, it } from "vitest";
import { getPickAssignment } from "./draft";

describe("getPickAssignment", () => {
  it("reverses order each round for snake (default)", () => {
    expect(getPickAssignment(1, 4)).toEqual({ round: 1, draftPosition: 1 });
    expect(getPickAssignment(4, 4)).toEqual({ round: 1, draftPosition: 4 });
    expect(getPickAssignment(5, 4)).toEqual({ round: 2, draftPosition: 4 });
    expect(getPickAssignment(8, 4)).toEqual({ round: 2, draftPosition: 1 });
    expect(getPickAssignment(9, 4)).toEqual({ round: 3, draftPosition: 1 });
  });

  it("repeats the same order every round for linear", () => {
    expect(getPickAssignment(1, 4, "linear")).toEqual({ round: 1, draftPosition: 1 });
    expect(getPickAssignment(4, 4, "linear")).toEqual({ round: 1, draftPosition: 4 });
    expect(getPickAssignment(5, 4, "linear")).toEqual({ round: 2, draftPosition: 1 });
    expect(getPickAssignment(8, 4, "linear")).toEqual({ round: 2, draftPosition: 4 });
  });
});
