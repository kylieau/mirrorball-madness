import Link from "next/link";
import { cn } from "cn";

// The mockup's "ticket stub" pattern for a next-deadline callout — a muted
// curtain-tinted card with punched-out notches on each edge. Kept quiet on
// purpose: the episode banner above it is Home's one loud theatrical element.
export function DeadlineStub({
  label,
  headline,
  ctaLabel,
  href,
  className,
}: {
  label: string;
  headline: string;
  ctaLabel: string;
  href: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-curtain/40 px-4 py-3",
        className
      )}
    >
      <span className="absolute top-1/2 -left-[7px] size-3.5 -translate-y-1/2 rounded-full bg-background" />
      <span className="absolute top-1/2 -right-[7px] size-3.5 -translate-y-1/2 rounded-full bg-background" />
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 font-heading text-base font-semibold text-foreground">{headline}</p>
      </div>
      <Link href={href} className="shrink-0 text-xs font-semibold text-accent">
        {ctaLabel} ›
      </Link>
    </div>
  );
}
