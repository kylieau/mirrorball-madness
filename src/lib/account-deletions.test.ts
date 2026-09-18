import { describe, expect, it } from "vitest";
import { resolveClearAccountDeletion, toPendingAccountDeletions } from "./account-deletions";

const older = {
  id: "aaa",
  display_name: "Ada",
  deletion_requested_at: "2026-09-01T12:00:00.000Z",
};
const newer = {
  id: "bbb",
  display_name: "Ben",
  deletion_requested_at: "2026-09-10T12:00:00.000Z",
};

describe("toPendingAccountDeletions", () => {
  it("drops rows that are no longer pending and attaches emails", () => {
    expect(
      toPendingAccountDeletions(
        [older, { id: "ccc", display_name: "Cara", deletion_requested_at: null }, newer],
        { aaa: "ada@example.com" }
      )
    ).toEqual([
      {
        id: "aaa",
        displayName: "Ada",
        email: "ada@example.com",
        deletionRequestedAt: "2026-09-01T12:00:00.000Z",
      },
      {
        id: "bbb",
        displayName: "Ben",
        email: null,
        deletionRequestedAt: "2026-09-10T12:00:00.000Z",
      },
    ]);
  });
});

describe("resolveClearAccountDeletion", () => {
  it("rejects a missing profile", () => {
    expect(resolveClearAccountDeletion(null)).toEqual({
      kind: "error",
      error: "Profile not found",
    });
  });

  it("rejects a profile with no pending request", () => {
    expect(resolveClearAccountDeletion({ deletion_requested_at: null })).toEqual({
      kind: "error",
      error: "No pending deletion request",
    });
  });

  it("applies when a request is pending", () => {
    expect(resolveClearAccountDeletion({ deletion_requested_at: older.deletion_requested_at })).toEqual({
      kind: "apply",
    });
  });
});
