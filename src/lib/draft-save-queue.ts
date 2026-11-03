export type DraftSaveResult = {
  error: string | null;
  // Which of the sent ids the server actually wrote. Absent means every sent
  // id was written (older save paths).
  acknowledgedIds?: string[];
  // Sent ids the server refused to write because that couple is already
  // posted. They stay dirty but are not re-sent until edited again.
  skippedIds?: string[];
};

// Revisions distinguish a second edit to the same couple from the values
// already in flight. Only one request may replace draft rows at a time.
export class DraftSaveQueue {
  private revisions = new Map<string, number>();
  private parked = new Map<string, number>();
  private revision = 0;
  private generation = 0;
  private pending: Promise<DraftSaveResult> | null = null;
  private pendingGeneration = 0;

  // Edits that still need a save; a parked edit (refused as posted at its
  // current revision) is excluded so it never blocks navigation or loops.
  dirtyIds(): string[] {
    return [...this.revisions.keys()].filter((id) => this.parked.get(id) !== this.revisions.get(id));
  }

  parkedIds(): string[] {
    return [...this.parked.keys()];
  }

  markDirty(id: string): void {
    this.revisions.set(id, ++this.revision);
  }

  // Drops an id whose edits no longer have anywhere to go (a deleted dance).
  discard(id: string): void {
    this.revisions.delete(id);
    this.parked.delete(id);
  }

  reset(): void {
    this.generation++;
    this.revisions.clear();
    this.parked.clear();
  }

  flush<T>(
    read: (ids: string[]) => T,
    save: (input: T) => Promise<DraftSaveResult>
  ): Promise<DraftSaveResult> {
    const generation = this.generation;
    if (this.pending) {
      if (this.pendingGeneration === generation) return this.pending;
      return this.pending.then(() => this.flush(read, save));
    }
    this.pendingGeneration = generation;
    const run = async (): Promise<DraftSaveResult> => {
      const skipped = new Set<string>();
      while (this.dirtyIds().length > 0) {
        const sent = new Map(this.revisions);
        let result: DraftSaveResult;
        try {
          result = await save(read([...sent.keys()]));
        } catch {
          return { error: "Draft could not be saved. Please try again." };
        }
        if (generation !== this.generation)
          return { error: "The selected episode changed during the save. Please try again." };
        if (result.error) {
          // A save that wrote some ids before failing says which; those are
          // done, the rest stay dirty for a retry.
          for (const id of result.acknowledgedIds ?? []) {
            if (this.revisions.get(id) === sent.get(id)) this.discard(id);
          }
          // An edit made while this request was out may fix what failed (a
          // corrected mark), and a flush that joined this one waits on it, so
          // send again rather than report an error about an older value.
          const editedSince = this.dirtyIds().some((id) => this.revisions.get(id) !== sent.get(id));
          if (!editedSince) return result;
          continue;
        }
        const acknowledged = result.acknowledgedIds ? new Set(result.acknowledgedIds) : null;
        const refused = new Set(result.skippedIds ?? []);
        for (const [id, revision] of sent) {
          if (this.revisions.get(id) !== revision) continue;
          if (refused.has(id)) {
            this.parked.set(id, revision);
            skipped.add(id);
          } else if (!acknowledged || acknowledged.has(id)) {
            this.revisions.delete(id);
            this.parked.delete(id);
          }
        }
      }
      return skipped.size > 0 ? { error: null, skippedIds: [...skipped] } : { error: null };
    };
    this.pending = run().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }
}
