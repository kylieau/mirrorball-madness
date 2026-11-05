import { cn } from "cn";
import { ordinal } from "@/lib/ordinal";

export function RankBadge({ rank, className }: { rank: number; className?: string }) {
  return (
    <div
      className={cn(
        "flex size-14 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-accent to-primary font-heading text-lg font-bold text-primary-foreground shadow-lg shadow-black/40",
        className
      )}
    >
      {ordinal(rank)}
    </div>
  );
}
