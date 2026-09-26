"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { markEpisodesWatchedThrough, unmarkEpisodesWatchedFrom } from "@/app/this-week/actions";
import type { SpoilerProgress } from "@/lib/spoiler-progress";
import { formatEpisodeCasual } from "@/lib/format-week";

export function WatchedThroughSetting({ progress }: { progress: SpoilerProgress | null }) {
  const router = useRouter();
  const [lastWatched, setLastWatched] = useState(progress?.watchedThroughWeek ?? 0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Newest week first, None last; every week stays pickable so a wrong pick can be fixed here.
  const options = [
    ...(progress?.weekNumbers ?? []).map((week) => ({ value: String(week), label: formatEpisodeCasual(week) })),
    { value: "0", label: progress ? "None" : "…" },
  ];
  const items = Object.fromEntries(options.map((option) => [option.value, option.label]));

  async function handleChange(value: string | null) {
    if (value === null || Number(value) === lastWatched) return;
    const week = Number(value);
    setError(null);
    setPending(true);
    // The unmark function takes the first unwatched week, so "I last watched N" is N + 1.
    const result = week > lastWatched ? await markEpisodesWatchedThrough(week) : await unmarkEpisodesWatchedFrom(week + 1);
    if (result.error) {
      setError(result.error);
    } else {
      setLastWatched(week);
      router.refresh();
    }
    setPending(false);
  }

  return (
    <div className="flex flex-col gap-2 px-4 pb-3 text-sm">
      <p className="text-xs text-foreground">Choose the last week you&apos;ve watched. Later results stay hidden.</p>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">I last watched</span>
        <Select items={items} value={String(lastWatched)} onValueChange={handleChange} disabled={pending || !progress}>
          <SelectTrigger className="h-8 w-28 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} align="start" className="min-w-0">
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
