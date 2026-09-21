"use client";

import { useState, type ReactNode } from "react";
import { defaultSelection, type DraftQueueDestination } from "@/lib/copy-picks";
import { moveQueueEntry } from "@/lib/draft";
import type { SaveState } from "@/lib/use-debounced-save";
import { AlsoSaveTo, OtherLeagueSaveSummary, UsePicksFrom } from "@/components/other-leagues-picker";
import type { LeagueSaveResult } from "@/app/leagues/[id]/predictions/actions";
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
  otherLeagues,
  onCopyToLeagues,
  onUseFrom,
}: {
  queue: string[];
  saveState: SaveState;
  availableIds: ReadonlySet<string>;
  nameFor: (coupleId: string) => ReactNode;
  onChange: (next: string[]) => void;
  otherLeagues: DraftQueueDestination[];
  onCopyToLeagues: (leagueIds: string[]) => Promise<LeagueSaveResult[]>;
  onUseFrom: (leagueId: string) => void;
}) {
  const [copyTo, setCopyTo] = useState(() => defaultSelection(otherLeagues));
  const [copying, setCopying] = useState(false);
  const [copyResults, setCopyResults] = useState<LeagueSaveResult[]>([]);

  async function handleCopy() {
    setCopying(true);
    setCopyResults(await onCopyToLeagues(copyTo));
    setCopying(false);
  }

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

        {visible.length === 0 && (
          <UsePicksFrom
            sources={otherLeagues.filter((d) => d.queue)}
            onPick={onUseFrom}
            placeholder="Use my queue from…"
          />
        )}

        {queue.length > 0 && otherLeagues.length > 0 && (
          <div className="flex flex-col gap-2">
            <AlsoSaveTo
              destinations={otherLeagues}
              selected={copyTo}
              onChange={setCopyTo}
              disabled={copying}
              verb="Copy to"
              replaceNote="replaces existing queue"
            />
            {copyTo.length > 0 && (
              <Button variant="outline" size="sm" className="self-start" disabled={copying} onClick={handleCopy}>
                {copying ? "Copying…" : "Copy Queue"}
              </Button>
            )}
            <OtherLeagueSaveSummary results={copyResults} destinations={otherLeagues} savedLabel="Copied to" />
          </div>
        )}

        <p className="h-4 text-xs text-muted-foreground">
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
        </p>
      </CardContent>
    </Card>
  );
}
