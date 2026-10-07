import { pacificClockOnSameDay, WEST_FEED_START_HOUR } from "./episode-banner";

export type PickLockCoast = "east" | "west";

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

// Mirrors prediction_lock_at (supabase/schema.sql), which stays the authority
// for submits and pick visibility; this only previews it in League Settings.
// The curtain is the week's first night on the league's coast; a negative
// hoursBeforeAir locks after it, capped at the end of that broadcast.
export function curtainCallLockAt({
  firstAirsAt,
  durationMinutes,
  coast,
  hoursBeforeAir,
}: {
  firstAirsAt: string;
  durationMinutes: number;
  coast: PickLockCoast;
  hoursBeforeAir: number;
}): Date {
  const eastCurtain = new Date(firstAirsAt);
  const curtain = coast === "west" ? pacificClockOnSameDay(eastCurtain, WEST_FEED_START_HOUR) : eastCurtain;
  const lock = curtain.getTime() - hoursBeforeAir * HOUR_MS;
  const showEnd = curtain.getTime() + durationMinutes * MINUTE_MS;
  return new Date(Math.min(lock, showEnd));
}

// "2h before the curtain", "At the curtain", "30m after the curtain".
export function describePickLockOffset(hoursBeforeAir: number): string {
  const minutes = Math.round(Math.abs(hoursBeforeAir) * 60);
  if (minutes === 0) return "At the curtain";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const amount = [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ");
  return `${amount} ${hoursBeforeAir > 0 ? "before" : "after"} the curtain`;
}
