import { describe, expect, it } from "vitest";
import { resolveJudgeRename } from "./admin-people";

const carrie = { id: "cai", name: "Carrie Ann Inaba", role: "judge" };

describe("resolveJudgeRename", () => {
  it("rejects a missing row", () => {
    expect(resolveJudgeRename(null, "Anyone", null)).toEqual({
      kind: "error",
      error: "Judge not found",
    });
  });

  it("rejects renaming a non-judge person", () => {
    expect(
      resolveJudgeRename({ id: "p1", name: "Derek Hough", role: "pro" }, "Derek", null)
    ).toEqual({ kind: "error", error: "Only scoring judges can be renamed" });
  });

  it("rejects a blank name after trim", () => {
    expect(resolveJudgeRename(carrie, "   ", null)).toEqual({
      kind: "error",
      error: "Judge name is required",
    });
  });

  it("treats an unchanged trimmed name as a no-op", () => {
    expect(resolveJudgeRename(carrie, "  Carrie Ann Inaba  ", null)).toEqual({ kind: "noop" });
  });

  it("rejects colliding with another standing or archived judge", () => {
    expect(resolveJudgeRename(carrie, "Bruno Tonioli", { id: "bt" })).toEqual({
      kind: "error",
      error: "A judge with that name already exists",
    });
  });

  it("does not treat the same row as a conflict", () => {
    expect(resolveJudgeRename(carrie, "Carrie Ann Inaba", { id: "cai" })).toEqual({ kind: "noop" });
  });

  it("applies a unique trimmed name", () => {
    expect(resolveJudgeRename(carrie, "  Carrie Ann  ", null)).toEqual({
      kind: "apply",
      name: "Carrie Ann",
    });
  });
});
