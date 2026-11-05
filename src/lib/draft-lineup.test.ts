import { describe, expect, it } from "vitest";
import { weekLineup, type DraftLineupRow } from "@/lib/draft-lineup";

const w8 = { id: "w8", week_number: 8 };
const w9 = { id: "w9", week_number: 9 };
const row = (over: Partial<DraftLineupRow>): DraftLineupRow => ({
  week_id: "w9",
  couple_id: "amber",
  dance_style_name: "Paso Doble",
  song_title: "Bring Me to Life",
  created_at: "2026-11-04T23:30:00Z",
  ...over,
});

describe("weekLineup", () => {
  it("lists each couple's dances in entry order, style alone when there is no song", () => {
    const lineup = weekLineup(
      [
        row({ couple_id: "julia", dance_style_name: "Jive", song_title: null, created_at: "2026-11-05T00:00:00Z" }),
        row({}),
        row({ dance_style_name: "Freestyle", song_title: "  ", created_at: "2026-11-05T01:00:00Z" }),
        row({ week_id: "w10", couple_id: "harry" }),
      ],
      w9,
      [w8],
      new Set(["w8"])
    );
    expect(Object.fromEntries(lineup)).toEqual({
      amber: ["Paso Doble · Bring Me to Life", "Freestyle"],
      julia: ["Jive"],
    });
  });

  it("stays empty until every earlier completed week is watched", () => {
    expect(weekLineup([row({})], w9, [{ id: "w7", week_number: 7 }, w8], new Set(["w7"])).size).toBe(0);
    expect(weekLineup([row({})], w9, [{ id: "w10", week_number: 10 }], new Set()).size).toBe(1);
  });
});
