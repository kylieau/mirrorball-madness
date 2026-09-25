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
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void getWatchedThroughWeek().then(setWatchedThrough);
  }, []);

  if (watchedThrough === null) return null;

  const weekItems = Object.fromEntries(
    Array.from({ length: watchedThrough }, (_, i) => [String(i + 1), formatEpisodeCasual(i + 1)])
  );

  async function handleUnmark(value: string | null) {
    if (!value) return;
    setError(null);
    setNotice(null);
    setPending(true);
    const result = await unmarkEpisodesWatchedFrom(Number(value));
    if (result.error) {
      setError(result.error);
    } else {
      const now = await getWatchedThroughWeek();
      setWatchedThrough(now);
      setNotice(
        now === 0
          ? "Nothing is marked as watched now. Every week is hidden until you mark it."
          : `Now caught up through ${formatEpisodeCasual(now)}. Later weeks are hidden until you mark them.`
      );
      router.refresh();
    }
    setPending(false);
  }

  return (
    <div className="flex items-start justify-between gap-3 px-4 pb-3 text-sm">
      <div className="flex flex-col gap-1">
        {notice ? (
          <p className="text-xs text-foreground">{notice}</p>
        ) : (
          <>
            <p className="text-xs text-foreground">
              {watchedThrough > 0 ? `Caught up through ${formatEpisodeCasual(watchedThrough)}.` : "Nothing marked as watched yet."}
            </p>
            <p className="text-xs text-muted-foreground">
              Fell behind? Pick the first week you haven&apos;t watched, and that week and everything after it is hidden
              again.
            </p>
          </>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <Select items={weekItems} value="" onValueChange={handleUnmark} disabled={pending || watchedThrough === 0}>
        <SelectTrigger className="h-8 w-36 shrink-0 text-xs">
          <SelectValue placeholder="First Unwatched…" />
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
