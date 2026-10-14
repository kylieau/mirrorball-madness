import { describe, expect, it, vi } from "vitest";
import { DraftSaveQueue } from "./draft-save-queue";

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
