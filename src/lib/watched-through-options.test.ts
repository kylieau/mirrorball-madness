import { describe, expect, it } from "vitest";
import { watchedThroughOptions } from "./watched-through-options";

const weeks = [8, 7, 6, 5, 4, 3, 2, 1];

describe("watchedThroughOptions", () => {
  it("shows the four newest weeks and leaves None out once four weeks exist", () => {
    expect(watchedThroughOptions(weeks, 8, true).map((option) => option.label)).toEqual([
      "Week 8",
      "Week 7",
      "Week 6",
      "Week 5",
    ]);
  });

  it("shows weeks 6 through 3 with no None in a mid-season window", () => {
    expect(watchedThroughOptions([6, 5, 4, 3, 2, 1], 6, true).map((option) => option.label)).toEqual([
      "Week 6",
      "Week 5",
      "Week 4",
      "Week 3",
    ]);
  });

  it("includes None while week 0 is still among the four most recent", () => {
    expect(watchedThroughOptions([2, 1], 2, true).map((option) => option.label)).toEqual([
      "Week 2",
      "Week 1",
      "None",
    ]);
    expect(watchedThroughOptions([3, 2, 1], 3, true).map((option) => option.label)).toEqual([
      "Week 3",
      "Week 2",
      "Week 1",
      "None",
    ]);
  });

  it("drops None once a fourth published week fills the window", () => {
    expect(watchedThroughOptions([4, 3, 2, 1], 4, true).map((option) => option.label)).toEqual([
      "Week 4",
      "Week 3",
      "Week 2",
      "Week 1",
    ]);
  });

  it("sorts an unsorted list newest first before capping", () => {
    expect(watchedThroughOptions([1, 4, 2, 3, 6, 5], 6, true).map((option) => option.value)).toEqual([
      "6",
      "5",
      "4",
      "3",
    ]);
  });

  it("keeps a current week mark that sits outside the four-week window", () => {
    expect(watchedThroughOptions(weeks, 2, true).map((option) => option.label)).toEqual([
      "Week 8",
      "Week 7",
      "Week 6",
      "Week 5",
      "Week 2",
    ]);
  });

  it("does not duplicate a current mark that is already in the window", () => {
    expect(watchedThroughOptions(weeks, 6, true).map((option) => option.label)).toEqual([
      "Week 8",
      "Week 7",
      "Week 6",
      "Week 5",
    ]);
  });

  it("does not add None just because the current mark is week 0", () => {
    expect(watchedThroughOptions([6, 5, 4, 3], 0, true).map((option) => option.label)).toEqual([
      "Week 6",
      "Week 5",
      "Week 4",
      "Week 3",
    ]);
  });

  it("uses the loading placeholder until progress has loaded", () => {
    expect(watchedThroughOptions([], 0, false)).toEqual([{ value: "0", label: "…" }]);
  });
});
