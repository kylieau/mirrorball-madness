import { describe, expect, it, vi } from "vitest";
import { DraftSaveQueue, type DraftSaveResult } from "./draft-save-queue";

function deferred() {
  let resolve!: (value: { error: string | null }) => void;
  const promise = new Promise<{ error: string | null }>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("DraftSaveQueue", () => {
  it("saves a newer edit to the same couple before flush resolves", async () => {
    const queue = new DraftSaveQueue();
    let score = 7;
    const first = deferred();
    const save = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue({ error: null });
    queue.markDirty("couple");
    const flushed = queue.flush(() => score, save);
    score = 8;
    queue.markDirty("couple");
    first.resolve({ error: null });
    await expect(flushed).resolves.toEqual({ error: null });
    expect(save.mock.calls).toEqual([[7], [8]]);
    expect(queue.dirtyIds()).toEqual([]);
  });

  it("serializes timer and publish flushes", async () => {
    const queue = new DraftSaveQueue();
    const first = deferred();
    const save = vi.fn().mockReturnValue(first.promise);
    queue.markDirty("couple");
    const a = queue.flush((ids) => ids, save);
    const b = queue.flush((ids) => ids, save);
    expect(a).toBe(b);
    expect(save).toHaveBeenCalledTimes(1);
    first.resolve({ error: null });
    await a;
  });

  it("keeps failed edits for a retry", async () => {
    const queue = new DraftSaveQueue();
    queue.markDirty("couple");
    await expect(
      queue.flush(
        (ids) => ids,
        async () => ({ error: "offline" })
      )
    ).resolves.toEqual({ error: "offline" });
    expect(queue.dirtyIds()).toEqual(["couple"]);
    await queue.flush(
      (ids) => ids,
      async () => ({ error: null })
    );
    expect(queue.dirtyIds()).toEqual([]);
  });

  it("clears the ids a failed save did write and keeps the rest", async () => {
    const queue = new DraftSaveQueue();
    queue.markDirty("a");
    queue.markDirty("b");
    await expect(
      queue.flush(
        (ids) => ids,
        async () => ({ error: "b is invalid", acknowledgedIds: ["a"] })
      )
    ).resolves.toEqual({ error: "b is invalid", acknowledgedIds: ["a"] });
    expect(queue.dirtyIds()).toEqual(["b"]);
  });

  it("resends a newer edit when a failed save acknowledges the older one", async () => {
    const queue = new DraftSaveQueue();
    const first = deferred();
    const save = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue({ error: "offline" });
    queue.markDirty("a");
    const flushed = queue.flush((ids) => ids, save);
    queue.markDirty("a");
    first.resolve({ error: "offline", acknowledgedIds: ["a"] } as { error: string | null });
    await expect(flushed).resolves.toEqual({ error: "offline" });
    expect(save).toHaveBeenCalledTimes(2);
    expect(queue.dirtyIds()).toEqual(["a"]);
  });

  it("sends a value reverted to the saved one while a newer save was in flight", async () => {
    const queue = new DraftSaveQueue();
    let mark = 9;
    const first = deferred();
    const save = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue({ error: null });
    queue.markDirty("team");
    const flushed = queue.flush(() => mark, save);
    mark = 8;
    queue.markDirty("team");
    first.resolve({ error: null });
    await flushed;
    expect(save.mock.calls).toEqual([[9], [8]]);
  });

  it("resends instead of failing when the failed id was edited during the request", async () => {
    const queue = new DraftSaveQueue();
    let valid = false;
    const first = deferred();
    const save = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockImplementation(async () => (valid ? { error: null } : { error: "invalid" }));
    queue.markDirty("a");
    queue.markDirty("b");
    const flushed = queue.flush((ids) => ids, save);
    valid = true;
    queue.markDirty("b");
    first.resolve({ error: "invalid", acknowledgedIds: ["a"] } as { error: string | null });
    await expect(flushed).resolves.toEqual({ error: null });
    expect(save.mock.calls).toEqual([[["a", "b"]], [["b"]]]);
    expect(queue.dirtyIds()).toEqual([]);
  });

  it("forgets a discarded id, even mid-save", async () => {
    const queue = new DraftSaveQueue();
    const first = deferred();
    const save = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue({ error: null });
    queue.markDirty("a");
    const flushed = queue.flush((ids) => ids, save);
    queue.markDirty("a");
    queue.discard("a");
    first.resolve({ error: null });
    await expect(flushed).resolves.toEqual({ error: null });
    expect(save).toHaveBeenCalledTimes(1);
    expect(queue.dirtyIds()).toEqual([]);
  });

  it("does not acknowledge edits from another episode", async () => {
    const queue = new DraftSaveQueue();
    const first = deferred();
    queue.markDirty("couple");
    const pending = queue.flush(
      (ids) => ids,
      () => first.promise
    );
    queue.reset();
    queue.markDirty("couple");
    first.resolve({ error: null });
    expect((await pending).error).toContain("episode changed");
    expect(queue.dirtyIds()).toEqual(["couple"]);
  });

  it("waits for an old episode's request before saving a new episode", async () => {
    const queue = new DraftSaveQueue();
    const first = deferred();
    const save = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue({ error: null });
    queue.markDirty("couple");
    const old = queue.flush(() => "old episode", save);
    queue.reset();
    queue.markDirty("couple");
    const next = queue.flush(() => "new episode", save);
    expect(save).toHaveBeenCalledTimes(1);
    first.resolve({ error: null });
    await expect(next).resolves.toEqual({ error: null });
    expect((await old).error).toContain("episode changed");
    expect(save.mock.calls).toEqual([["old episode"], ["new episode"]]);
    expect(queue.dirtyIds()).toEqual([]);
  });

  it("clears only acknowledged ids and parks a posted couple's refused edit", async () => {
    const queue = new DraftSaveQueue();
    queue.markDirty("amber");
    queue.markDirty("julia");
    const save = vi.fn(async (ids: string[]) => ({
      error: null,
      acknowledgedIds: ids.filter((id) => id !== "amber"),
      skippedIds: ids.filter((id) => id === "amber"),
    }));
    await expect(queue.flush((ids) => ids, save)).resolves.toEqual({ error: null, skippedIds: ["amber"] });
    expect(save).toHaveBeenCalledTimes(1); // A refused edit is not re-sent in a loop.
    expect(queue.dirtyIds()).toEqual([]);
    expect(queue.parkedIds()).toEqual(["amber"]);
    // Nothing new to send: the parked edit stays parked without a request.
    await expect(queue.flush((ids) => ids, save)).resolves.toEqual({ error: null });
    expect(save).toHaveBeenCalledTimes(1);
    // Editing the couple again makes the edit sendable once more.
    queue.markDirty("amber");
    expect(queue.dirtyIds()).toEqual(["amber"]);
    save.mockResolvedValueOnce({ error: null, acknowledgedIds: ["amber"], skippedIds: [] });
    await expect(queue.flush((ids) => ids, save)).resolves.toEqual({ error: null });
    expect(queue.parkedIds()).toEqual([]);
    expect(queue.dirtyIds()).toEqual([]);
  });

  it("parks a posted couple's edit when the same save fails on another couple", async () => {
    const queue = new DraftSaveQueue();
    queue.markDirty("amber");
    queue.markDirty("julia");
    queue.markDirty("typo");
    const save = vi.fn(async (): Promise<DraftSaveResult> => ({ error: "Fix typo first.", acknowledgedIds: ["julia"], skippedIds: ["amber"] }));
    await expect(queue.flush((ids) => ids, save)).resolves.toEqual({ error: "Fix typo first.", acknowledgedIds: ["julia"], skippedIds: ["amber"] });
    expect(queue.dirtyIds()).toEqual(["typo"]);
    expect(queue.parkedIds()).toEqual(["amber"]);
    // Nothing but the held couple keeps a flush going.
    save.mockResolvedValueOnce({ error: null, acknowledgedIds: ["typo"], skippedIds: ["amber"] });
    await expect(queue.flush((ids) => ids, save)).resolves.toEqual({ error: null, skippedIds: ["amber"] });
    expect(save).toHaveBeenCalledTimes(2);
    expect(queue.dirtyIds()).toEqual([]);
  });

  it("treats a save without acknowledgements as having written every sent id", async () => {
    const queue = new DraftSaveQueue();
    queue.markDirty("couple");
    await expect(queue.flush((ids) => ids, async () => ({ error: null }))).resolves.toEqual({ error: null });
    expect(queue.dirtyIds()).toEqual([]);
  });

  it("retains edits when a request throws", async () => {
    const queue = new DraftSaveQueue();
    queue.markDirty("couple");
    expect(
      (
        await queue.flush(
          (ids) => ids,
          async () => {
            throw new Error("network");
          }
        )
      ).error
    ).toBeTruthy();
    expect(queue.dirtyIds()).toEqual(["couple"]);
  });
});
