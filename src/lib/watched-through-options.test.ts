import { describe, expect, it } from "vitest";
import { watchedThroughOptions } from "./watched-through-options";

const weeks = [8, 7, 6, 5, 4, 3, 2, 1];

describe("watchedThroughOptions", () => {
  it("keeps the four newest weeks, newest first, plus None", () => {
    expect(watchedThroughOptions(weeks, 8, true).map((option) => option.label)).toEqual([
      "Week 8",
      "Week 7",
      "Week 6",
      "Week 5",
      "None",
    ]);
  });

  it("shows every available week when fewer than four exist", () => {
    expect(watchedThroughOptions([2, 1], 2, true).map((option) => option.label)).toEqual([
      "Week 2",
      "Week 1",
      "None",
    ]);
  });

  it("sorts an unsorted list newest first before capping", () => {
    expect(watchedThroughOptions([1, 4, 2, 3, 6, 5], 6, true).map((option) => option.value)).toEqual([
      "6",
      "5",
      "4",
      "3",
      "0",
    ]);
  });

  it("keeps the current mark when it sits outside the four-week window", () => {
    expect(watchedThroughOptions(weeks, 2, true).map((option) => option.label)).toEqual([
      "Week 8",
      "Week 7",
      "Week 6",
      "Week 5",
      "Week 2",
      "None",
    ]);
  });

  it("does not duplicate a current mark that is already in the window", () => {
    expect(watchedThroughOptions(weeks, 6, true).map((option) => option.label)).toEqual([
      "Week 8",
      "Week 7",
      "Week 6",
      "Week 5",
      "None",
    ]);
  });

  it("uses the loading placeholder until progress has loaded", () => {
    expect(watchedThroughOptions([], 0, false)).toEqual([{ value: "0", label: "…" }]);
  });
});
