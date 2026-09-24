import { describe, expect, it } from "vitest";
import { deriveResultsStatus } from "./results-status";

describe("deriveResultsStatus", () => {
  it("is not_started with no draft and never published", () => {
    expect(deriveResultsStatus({ results_published_at: null }, false)).toBe("not_started");
  });

  it("is draft when a draft exists and it's never been published", () => {
    expect(deriveResultsStatus({ results_published_at: null }, true)).toBe("draft");
  });

  it("is published when there's no draft and it has been published", () => {
    expect(deriveResultsStatus({ results_published_at: "2026-01-01T00:00:00Z" }, false)).toBe("published");
  });

  it("is revealing when an unpublished draft has couples already posted", () => {
    expect(deriveResultsStatus({ results_published_at: null }, true, true)).toBe("revealing");
  });

  it("is draft_correcting when a draft exists for an already-published episode", () => {
    expect(deriveResultsStatus({ results_published_at: "2026-01-01T00:00:00Z" }, true)).toBe(
      "draft_correcting"
    );
  });
});
