import { describe, expect, it } from "vitest";
import { buildLeagueRosters, orderManagersForRosters } from "./league-rosters";

const names = (celebrity: string) => ({ celebrity, pro: "Pro" });
const couples = [
  { id: "a", status: "active", eliminationWeek: null, names: names("Ann") },
  { id: "b", status: "eliminated", eliminationWeek: 2, names: names("Bo") },
  { id: "c", status: "active", eliminationWeek: null, names: names("Cy") },
];
const managers = [
  { managerId: "m1", displayName: "One" },
  { managerId: "m2", displayName: "Two" },
];
const slots = [
  { managerId: "m1", coupleId: "a" },
  { managerId: "m2", coupleId: "b" },
];

describe("buildLeagueRosters", () => {
  it("groups couples by manager in the given order and lists unrostered ones", () => {
    const { groups, unrostered } = buildLeagueRosters({ managers, slots, couples, viewerId: "m2" });
    expect(groups.map((g) => [g.displayName, g.isViewer, g.couples.map((c) => c.coupleId)])).toEqual([
      ["One", false, ["a"]],
      ["Two", true, ["b"]],
    ]);
    expect(unrostered.map((c) => c.coupleId)).toEqual(["c"]);
  });

  it("omits status when no week is given", () => {
    const { groups } = buildLeagueRosters({ managers, slots, couples, viewerId: "m1" });
    expect(groups[1].couples[0].eliminated).toBeUndefined();
  });

  it("tags a couple as eliminated only from its elimination week onward", () => {
    const at = (asOfWeek: number) =>
      buildLeagueRosters({ managers, slots, couples, viewerId: "m1", asOfWeek }).groups[1].couples[0].eliminated;
    expect(at(1)).toBe(false);
    expect(at(2)).toBe(true);
    expect(at(5)).toBe(true);
  });

  it("attaches per-couple points", () => {
    const { groups } = buildLeagueRosters({
      managers, slots, couples, viewerId: "m1", pointsByCoupleId: new Map([["a", { week: 10, total: 120 }]]),
    });
    expect(groups[0].couples[0].points).toEqual({ week: 10, total: 120 });
    expect(groups[1].couples[0].points).toBeUndefined();
  });
});

describe("orderManagersForRosters", () => {
  const list = [
    { managerId: "m2", displayName: "Zed", totalPoints: 0 },
    { managerId: "m1", displayName: "Ann", totalPoints: 0 },
    { managerId: "m3", displayName: "Bea", totalPoints: 0 },
  ];

  it("puts the viewer first then alphabetical before anyone has scored", () => {
    expect(orderManagersForRosters(list, "m2").map((m) => m.displayName)).toEqual(["Zed", "Ann", "Bea"]);
  });

  it("switches to standings order once anyone has points", () => {
    const scored = list.map((m) => (m.managerId === "m3" ? { ...m, totalPoints: 40 } : m));
    expect(orderManagersForRosters(scored, "m2")[0].displayName).toBe("Bea");
  });
});
