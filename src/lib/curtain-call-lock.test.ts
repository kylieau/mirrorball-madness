import { describe, expect, it } from "vitest";
import { curtainCallLockAt, describePickLockOffset } from "./curtain-call-lock";

// Tue 2026-10-06, 8pm EDT = 00:00Z Oct 7; the West feed is 8pm PDT = 03:00Z.
const OCT_EAST = "2026-10-07T00:00:00Z";

function lock(coast: "east" | "west", hoursBeforeAir: number, firstAirsAt = OCT_EAST, durationMinutes = 120) {
  return curtainCallLockAt({ firstAirsAt, durationMinutes, coast, hoursBeforeAir }).toISOString();
}

describe("curtainCallLockAt", () => {
  it("locks an East league at or before the East curtain, as before", () => {
    expect(lock("east", 0)).toBe("2026-10-07T00:00:00.000Z");
    expect(lock("east", 2)).toBe("2026-10-06T22:00:00.000Z");
  });

  it("locks a West league against 8pm PT on the same air date", () => {
    expect(lock("west", 0)).toBe("2026-10-07T03:00:00.000Z");
    expect(lock("west", 1.5)).toBe("2026-10-07T01:30:00.000Z");
  });

  it("locks after the curtain on a negative lead time", () => {
    expect(lock("east", -0.5)).toBe("2026-10-07T00:30:00.000Z");
    expect(lock("west", -1)).toBe("2026-10-07T04:00:00.000Z");
  });

  it("never locks after that coast's broadcast has ended", () => {
    expect(lock("east", -3)).toBe("2026-10-07T02:00:00.000Z");
    expect(lock("west", -5)).toBe("2026-10-07T05:00:00.000Z");
    expect(lock("west", -2, OCT_EAST, 90)).toBe("2026-10-07T04:30:00.000Z");
  });

  it("follows Pacific standard time once the clocks fall back", () => {
    // Tue 2026-11-10, 8pm EST = 01:00Z Nov 11; 8pm PST = 04:00Z.
    expect(lock("west", 0, "2026-11-11T01:00:00Z")).toBe("2026-11-11T04:00:00.000Z");
  });
});

describe("describePickLockOffset", () => {
  it("reads the lead time relative to the curtain", () => {
    expect(describePickLockOffset(0)).toBe("At the curtain");
    expect(describePickLockOffset(2)).toBe("2h before the curtain");
    expect(describePickLockOffset(1.5)).toBe("1h 30m before the curtain");
    expect(describePickLockOffset(-0.5)).toBe("30m after the curtain");
  });
});
