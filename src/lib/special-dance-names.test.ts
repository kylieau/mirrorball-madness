import { describe, expect, it } from "vitest";
import { specialDanceFullName, specialDanceShortName, specialDanceTypeAndName, specialDanceTypeBadge } from "./special-dance-names";

const cases = [
  { dance: { name: "Slaytopia", danceType: "Team Dance" }, short: "Slaytopia", full: "Team Dance · Slaytopia", badge: "Team Dance" },
  { dance: { name: "Team Dance 2", danceType: "Team Dance" }, short: "Team Dance 2", full: "Team Dance 2", badge: null },
  { dance: { name: "Villains", danceType: "Trio" }, short: "Villains", full: "Trio · Villains", badge: "Trio" },
  { dance: { name: "Dance-Off 2", danceType: "Dance-Off" }, short: "Dance-Off 2", full: "Dance-Off 2", badge: null },
  { dance: { name: "Dance-Off", danceType: "Dance-Off" }, short: "Dance-Off", full: "Dance-Off", badge: null },
  { dance: { name: "Dance-Off Immunity", danceType: "Immunity" }, short: "Dance-Off Immunity", full: "Dance-Off Immunity", badge: null },
  { dance: { name: " ", danceType: "Marathon" }, short: "Marathon", full: "Marathon", badge: null },
];

describe("special dance names", () => {
  it.each(cases)("names $dance.name ($dance.danceType)", ({ dance, short, full, badge }) => {
    expect(specialDanceShortName(dance)).toBe(short);
    expect(specialDanceFullName(dance)).toBe(full);
    expect(specialDanceTypeBadge(dance)).toBe(badge);
  });
});

describe("specialDanceTypeAndName", () => {
  it("leads with the type and adds the name only when the name doesn't say it", () => {
    expect(specialDanceTypeAndName({ name: "Slaytopia", danceType: "Team Dance" })).toEqual({ type: "Team Dance", name: "Slaytopia" });
    expect(specialDanceTypeAndName({ name: "Dance-Off 1", danceType: "Dance-Off" })).toEqual({ type: "Dance-Off 1", name: null });
    expect(specialDanceTypeAndName({ name: "Dance-Off Immunity", danceType: "Immunity" })).toEqual({ type: "Dance-Off Immunity", name: null });
  });
});
