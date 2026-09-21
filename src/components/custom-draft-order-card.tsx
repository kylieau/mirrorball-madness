"use client";

import type { ReactNode } from "react";
import { moveInCustomOrder } from "@/lib/draft";
import type { SaveState } from "@/lib/use-debounced-save";
import { Button } from "@/components/ui/button";

// The 'custom' draft order: every round is its own arrangement, so a
// commissioner can hand-balance a board where it is already obvious which
// couples are worthless. Snake pairs pick i with pick 2N+1-i, which leaves the
// end seats absorbing a known dud once the cast is a known quantity.
export function CustomDraftOrderCard({
  sequence,
  rounds,
  memberCount,
  managerLabel,
  saveState,
  editable,
  onChange,
  onResetToSnake,
}: {
  sequence: string[];
  rounds: number;
  memberCount: number;
  managerLabel: (userId: string) => ReactNode;
  saveState: SaveState;
  editable: boolean;
  onChange: (next: string[]) => void;
  onResetToSnake: () => void;
}) {
  if (rounds < 1 || memberCount < 1) {
    return (
      <p className="text-sm text-muted-foreground">
        Every manager needs at least one pick before the order can be set.
      </p>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4 text-left">
      <p className="text-sm text-muted-foreground">
        {editable
          ? "Each round has its own order — arrange every round however you like."
          : "Draft order set by commissioner:"}
      </p>

      {Array.from({ length: rounds }, (_, roundIndex) => (
        <div key={roundIndex} className="flex flex-col gap-1">
          <p className="text-xs font-semibold text-accent">Round {roundIndex + 1}</p>
          {sequence
            .slice(roundIndex * memberCount, roundIndex * memberCount + memberCount)
            .map((userId, indexInRound) => {
              const pickNumber = roundIndex * memberCount + indexInRound + 1;
              return (
                <div
                  key={`${roundIndex}-${indexInRound}`}
                  className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5 text-sm"
                >
                  <span className="min-w-0 truncate">
                    <span className="text-muted-foreground">{pickNumber}.</span>{" "}
                    {managerLabel(userId)}
                  </span>
                  {editable && (
                    <span className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Move up in round ${roundIndex + 1}`}
                        disabled={indexInRound === 0}
                        onClick={() =>
                          onChange(moveInCustomOrder(sequence, memberCount, roundIndex, indexInRound, -1))
                        }
                      >
                        ↑
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Move down in round ${roundIndex + 1}`}
                        disabled={indexInRound === memberCount - 1}
                        onClick={() =>
                          onChange(moveInCustomOrder(sequence, memberCount, roundIndex, indexInRound, 1))
                        }
                      >
                        ↓
                      </Button>
                    </span>
                  )}
                </div>
              );
            })}
        </div>
      ))}

      {editable && (
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onResetToSnake}>
            Reset to Snake
          </Button>
          <span className="text-xs text-muted-foreground">
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
          </span>
        </div>
      )}
    </div>
  );
}
