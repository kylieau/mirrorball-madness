import { describe, expect, it } from "vitest";
import { safeRelativePath } from "./safe-relative-path";

describe("safeRelativePath", () => {
  it.each([
    "/",
    "/leagues/123/picks?week=2#scores",
    "/search?q=hello%20world",
    "/results?next=https://example.com",
  ])("keeps local path %s", (path) => {
    expect(safeRelativePath(path, "/fallback")).toBe(path);
  });
  it.each([
    undefined,
    "",
    "https://example.com",
    "//example.com",
    "/\\example.com",
    "/\n/example.com",
    "/\t/example.com",
    " /home",
    "/\r/example.com",
    "/\u0000/example.com",
  ])("rejects unsafe destination %s", (path) => {
    expect(safeRelativePath(path, "/fallback")).toBe("/fallback");
  });
});
