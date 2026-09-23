import { describe, expect, it } from "vitest";
import { inJeopardyIdsToPersist } from "./scoring";

describe("inJeopardyIdsToPersist", () => {
  it("drops eliminated couples and duplicate ticks", () => {
    expect(
      inJeopardyIdsToPersist(
        ["safe-one", "gone", "safe-one", "other"],
        [
          { coupleId: "gone", outcome: "eliminated" },
          { coupleId: "safe-one", outcome: "safe" },
          { coupleId: "other", outcome: "bye" },
        ]
      )
    ).toEqual(["safe-one", "other"]);
  });
});
