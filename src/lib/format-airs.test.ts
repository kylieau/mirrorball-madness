import { describe, expect, it } from "vitest";
import { formatAirsAt } from "./format-airs";

// Local-time construction keeps these independent of the machine's time zone.
const local = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h);

describe("formatAirsAt", () => {
  const now = local(2026, 9, 22, 12);
  const at = (day: number, hour = 20) => local(2026, 9, day, hour).toISOString();

  it("says Today and Tomorrow", () => {
    expect(formatAirsAt(at(22), now)).toMatch(/^Today 8 PM/);
    expect(formatAirsAt(at(23), now)).toMatch(/^Tomorrow 8 PM/);
  });

  it("uses the weekday name within the next week", () => {
    expect(formatAirsAt(at(24), now)).toMatch(/^Thursday 8 PM/);
    expect(formatAirsAt(at(28), now)).toMatch(/^Monday 8 PM/);
  });

  it("falls back to a short date a week or more out", () => {
    expect(formatAirsAt(at(29), now)).toMatch(/^Tue, Sep 29 8 PM/);
  });
});
