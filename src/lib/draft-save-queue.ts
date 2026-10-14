export type DraftSaveResult = { error: string | null };

// Revisions distinguish a second edit to the same couple from the values
// already in flight. Only one request may replace draft rows at a time.
export class DraftSaveQueue {
  private revisions = new Map<string, number>();
  private revision = 0;
  private generation = 0;
  private pending: Promise<DraftSaveResult> | null = null;
  private pendingGeneration = 0;

  dirtyIds(): string[] {
    return [...this.revisions.keys()];
  }

  markDirty(id: string): void {
    this.revisions.set(id, ++this.revision);
  }

  reset(): void {
    this.generation++;
    this.revisions.clear();
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
      while (this.revisions.size > 0) {
        const sent = new Map(this.revisions);
        let result: DraftSaveResult;
        try {
          result = await save(read([...sent.keys()]));
        } catch {
          return { error: "Draft could not be saved. Please try again." };
        }
        if (generation !== this.generation)
          return { error: "The selected episode changed during the save. Please try again." };
        if (result.error) return result;
        for (const [id, revision] of sent) {
          if (this.revisions.get(id) === revision) this.revisions.delete(id);
        }
      }
      return { error: null };
    };
    this.pending = run().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }
}
