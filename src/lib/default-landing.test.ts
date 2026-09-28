import { describe, expect, it } from "vitest";
import { getDefaultLandingPath } from "./default-landing";

describe("getDefaultLandingPath", () => {
  it("lands a signed-in user on the fan Home tab", () => {
    expect(getDefaultLandingPath()).toBe("/");
  });
});
