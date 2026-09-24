"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getWatchedThroughWeek, unmarkEpisodesWatchedFrom } from "@/app/this-week/actions";
import { formatEpisodeCasual } from "@/lib/format-week";

export function WatchedThroughSetting() {
  const router = useRouter();
  const [watchedThrough, setWatchedThrough] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getWatchedThroughWeek().then(setWatchedThrough);
  }, []);

  if (!watchedThrough) return null;

  const weekItems = Object.fromEntries(
    Array.from({ length: watchedThrough }, (_, i) => [String(i + 1), formatEpisodeCasual(i + 1)])
  );

  async function handleUnmark(value: string | null) {
    if (!value) return;
    setError(null);
    setPending(true);
    const result = await unmarkEpisodesWatchedFrom(Number(value));
    if (result.error) {
      setError(result.error);
    } else {
      setWatchedThrough(await getWatchedThroughWeek());
      router.refresh();
    }
    setPending(false);
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 pb-3 text-sm">
      <div>
        <p className="text-xs text-muted-foreground">
          Watched through {formatEpisodeCasual(watchedThrough)}. Choose a week to hide it and everything after it again.
        </p>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
      <Select items={weekItems} value="" onValueChange={handleUnmark} disabled={pending}>
        <SelectTrigger className="h-8 w-32 shrink-0 text-xs">
          <SelectValue placeholder="Hide From…" />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(weekItems).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
