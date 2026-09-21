"use client";

import { useState } from "react";
import { cn } from "cn";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isSelectable, type Destination } from "@/lib/copy-picks";
import type { LeagueSaveResult } from "@/app/leagues/[id]/predictions/actions";

export function AlsoSaveTo({
  destinations,
  selected,
  onChange,
  disabled,
}: {
  destinations: Destination[];
  selected: string[];
  onChange: (leagueIds: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (destinations.length === 0) return null;

  function toggle(leagueId: string) {
    onChange(selected.includes(leagueId) ? selected.filter((id) => id !== leagueId) : [...selected, leagueId]);
  }

  const replacing = destinations.filter((d) => d.status === "will_replace" && selected.includes(d.id));
  const summary =
    selected.length === 0
      ? "Also save to other leagues"
      : `Also save to ${selected.length} league${selected.length === 1 ? "" : "s"}`;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 self-start text-xs text-muted-foreground"
      >
        <span className="font-medium text-foreground">{summary}</span>
        {replacing.length > 0 && <span>· ↻ replaces existing picks</span>}
        <span aria-hidden>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="flex flex-col divide-y divide-border rounded-md border border-border">
          {destinations.map((d) => {
            const on = selected.includes(d.id);
            return (
              <button
                key={d.id}
                type="button"
                aria-pressed={on}
                disabled={!isSelectable(d.status) || disabled}
                onClick={() => toggle(d.id)}
                className="flex items-center gap-2 px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-[4px] border text-[10px]",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-input"
                  )}
                >
                  {on && "✓"}
                </span>
                <span className="min-w-0 flex-1 truncate">{d.name}</span>
                {d.note && <span className="shrink-0 text-xs text-muted-foreground">{d.note}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function UsePicksFrom({
  sources,
  onPick,
}: {
  sources: { id: string; name: string }[];
  onPick: (leagueId: string) => void;
}) {
  if (sources.length === 0) return null;

  const placeholder = "Use my picks from…";
  const items = { "": placeholder, ...Object.fromEntries(sources.map((s) => [s.id, s.name])) };

  return (
    <Select items={items} value="" onValueChange={(v) => v && onPick(v)}>
      <SelectTrigger className="w-full" aria-label={placeholder}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        {sources.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function OtherLeagueSaveSummary({
  results,
  destinations,
}: {
  results: LeagueSaveResult[];
  destinations: Destination[];
}) {
  if (results.length === 0) return null;
  const nameFor = (id: string) => destinations.find((d) => d.id === id)?.name ?? "another league";

  return (
    <ul className="flex flex-col gap-1 text-xs">
      {results.map((r) =>
        r.error ? (
          <li key={r.leagueId} className="text-destructive">
            Couldn&apos;t save to {nameFor(r.leagueId)}: {r.error}
          </li>
        ) : (
          <li key={r.leagueId} className="text-emerald-text">
            ✓ Also saved to {nameFor(r.leagueId)}
          </li>
        )
      )}
    </ul>
  );
}
