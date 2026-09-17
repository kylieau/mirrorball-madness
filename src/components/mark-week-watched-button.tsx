"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { markEpisodesWatchedThrough } from "@/app/this-week/actions";

export function MarkWeekWatchedButton({ weekNumber }: { weekNumber: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setPending(true);
    const result = await markEpisodesWatchedThrough(weekNumber);
    if (result.error) {
      setError(result.error);
      setPending(false);
    } else {
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={handleClick} disabled={pending} className="self-start">
        {pending ? "Marking as watched..." : `Mark Episode ${weekNumber} as watched`}
      </Button>
    </div>
  );
}
