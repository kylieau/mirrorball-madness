import type { DraftState } from "./results-draft";

export type DraftSummary = {
  hasDraft: boolean;
  entryCount: number;
  draftedCoupleIds: string[];
};

export function summarizeDrafts(drafts: Record<string, DraftState>): Record<string, DraftSummary> {
  return Object.fromEntries(Object.entries(drafts).map(([id, draft]) => [id, {
    hasDraft: draft.hasDraft,
    entryCount: draft.entries.length,
    draftedCoupleIds: [...new Set(draft.dances.map((dance) => dance.coupleId))],
  }]));
}

