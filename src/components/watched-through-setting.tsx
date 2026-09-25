"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getWatchedThroughWeek, unmarkEpisodesWatchedFrom } from "@/app/this-week/actions";
import { formatEpisodeCasual } from "@/lib/format-week";

export function WatchedThroughSetting() {
  const router = useRouter();
  const [lastWatched, setLastWatched] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getWatchedThroughWeek().then(setLastWatched);
  }, []);

  if (lastWatched === null) return null;

  // Only weeks up to the current mark: this control can hide weeks again, never reveal more.
  const items: Record<string, string> = { "0": "None" };
  for (let week = 1; week <= lastWatched; week++) items[String(week)] = formatEpisodeCasual(week);

  async function handleChange(value: string | null) {
    if (value === null || Number(value) === lastWatched) return;
    setError(null);
    setPending(true);
    // The server function takes the first unwatched week, so "I last watched N" is N + 1.
    const result = await unmarkEpisodesWatchedFrom(Number(value) + 1);
    if (result.error) {
      setError(result.error);
    } else {
      setLastWatched(await getWatchedThroughWeek());
      router.refresh();
    }
    setPending(false);
  }

  return (
    <div className="flex flex-col gap-2 px-4 pb-3 text-sm">
      <p className="text-xs text-foreground">Fell behind? Hide unwatched episode results.</p>
      <Select items={items} value={String(lastWatched)} onValueChange={handleChange} disabled={pending}>
        <SelectTrigger className="h-9 w-full text-sm">
          <span className="text-muted-foreground">I last watched</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(items).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
