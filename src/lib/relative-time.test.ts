import { describe, expect, it } from "vitest";
import { formatCountdown } from "./relative-time";

describe("formatCountdown", () => {
  const now = new Date("2026-09-15T12:00:00Z");

  it("shows days and hours when more than a day out", () => {
    expect(formatCountdown("2026-09-17T15:00:00Z", now)).toBe("Closes in 2d 3h");
  });

  it("shows hours and minutes when less than a day out", () => {
    expect(formatCountdown("2026-09-15T16:12:00Z", now)).toBe("Closes in 4h 12m");
  });

  it("shows just minutes when less than an hour out", () => {
    expect(formatCountdown("2026-09-15T12:45:00Z", now)).toBe("Closes in 45m");
  });

  it("flags under a minute distinctly rather than showing 0m", () => {
    expect(formatCountdown("2026-09-15T12:00:30Z", now)).toBe("Closes in under a minute");
  });

  it("treats a past deadline as closed", () => {
    expect(formatCountdown("2026-09-15T11:00:00Z", now)).toBe("Closed");
  });
});
