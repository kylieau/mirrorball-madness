import { describe, expect, it } from "vitest";
import { buildLeagueGrandFinalePredictions } from "./grand-finale-predictions";

const members = [
  { user_id: "m1", profiles: { display_name: "Zed" }, co_manager: null },
  { user_id: "m2", profiles: { display_name: "Ann" }, co_manager: null },
  { user_id: "m3", profiles: { display_name: "Bea" }, co_manager: { display_name: "Cal" } },
];

describe("buildLeagueGrandFinalePredictions", () => {
  it("groups predictions by manager and sorts each order by predicted_position", () => {
    const predictions = [
      { manager_id: "m1", couple_id: "b", predicted_position: 2 },
      { manager_id: "m1", couple_id: "a", predicted_position: 1 },
    ];
    const result = buildLeagueGrandFinalePredictions({ predictions, members, viewerTeamId: "m2" });
    expect(result.find((r) => r.managerId === "m1")?.order).toEqual(["a", "b"]);
  });

  it("combines a co-manager's display name via formatManagerName", () => {
    const predictions = [{ manager_id: "m3", couple_id: "a", predicted_position: 1 }];
    const result = buildLeagueGrandFinalePredictions({ predictions, members, viewerTeamId: "m2" });
    expect(result.find((r) => r.managerId === "m3")?.displayName).toBe("Bea & Cal");
  });

  it("omits managers with no submitted rows", () => {
    const predictions = [{ manager_id: "m1", couple_id: "a", predicted_position: 1 }];
    const result = buildLeagueGrandFinalePredictions({ predictions, members, viewerTeamId: "m2" });
    expect(result.map((r) => r.managerId)).toEqual(["m1"]);
  });

  it("leaves the viewer out and sorts everyone else alphabetically", () => {
    const predictions = [
      { manager_id: "m1", couple_id: "a", predicted_position: 1 },
      { manager_id: "m2", couple_id: "a", predicted_position: 1 },
      { manager_id: "m3", couple_id: "a", predicted_position: 1 },
    ];
    const result = buildLeagueGrandFinalePredictions({ predictions, members, viewerTeamId: "m2" });
    expect(result.map((r) => r.displayName)).toEqual(["Bea & Cal", "Zed"]);
  });
});
