"use client";

import type { ReactNode } from "react";
import { moveQueueEntry } from "@/lib/draft";
import type { SaveState } from "@/lib/use-debounced-save";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ADD_PLACEHOLDER = "Add a couple…";

export function DraftQueueCard({
  queue,
  saveState,
  availableIds,
  nameFor,
  onChange,
}: {
  queue: string[];
  saveState: SaveState;
  availableIds: ReadonlySet<string>;
  nameFor: (coupleId: string) => ReactNode;
  onChange: (next: string[]) => void;
}) {
  // Drafted couples silently drop out; the server skips them anyway, so this
  // only keeps the list honest and the next save tidy.
  const visible = queue.filter((id) => availableIds.has(id));
  const addable = [...availableIds].filter((id) => !visible.includes(id));
  const update = onChange;

  const items: Record<string, ReactNode> = {
    "": ADD_PLACEHOLDER,
    ...Object.fromEntries(addable.map((id) => [id, nameFor(id)])),
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Auto-Pick Queue</CardTitle>
        <CardDescription>
          Ranked wishlist only you can see. If you&apos;re on autopilot or your clock runs
          out, you get your highest-ranked couple that&apos;s still available; if your
          list runs dry, it&apos;s random.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing queued — auto-picks are random.</p>
        ) : (
          <ol className="flex flex-col gap-1">
            {visible.map((id, i) => (
              <li
                key={id}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5 text-sm"
              >
                <span>
                  {i + 1}. {nameFor(id)}
                </span>
                <span className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Move up"
                    disabled={i === 0}
                    onClick={() => update(moveQueueEntry(visible, i, -1))}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Move down"
                    disabled={i === visible.length - 1}
                    onClick={() => update(moveQueueEntry(visible, i, 1))}
                  >
                    ↓
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove from queue"
                    onClick={() => update(visible.filter((v) => v !== id))}
                  >
                    ✕
                  </Button>
                </span>
              </li>
            ))}
          </ol>
        )}

        {addable.length > 0 && (
          <Select
            items={items}
            value=""
            onValueChange={(v) => {
              if (v) update([...visible, v]);
            }}
          >
            <SelectTrigger className="w-full" aria-label="Add a couple to your queue">
              <SelectValue placeholder={ADD_PLACEHOLDER} />
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              {addable.map((id) => (
                <SelectItem key={id} value={id}>
                  {nameFor(id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <p className="h-4 text-xs text-muted-foreground">
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
        </p>
      </CardContent>
    </Card>
  );
}
