import Link from "next/link";
import { cn } from "cn";

// The mockup's "ticket stub" pattern for a next-deadline callout — a muted
// curtain-tinted card with punched-out notches on each edge. Kept quiet on
// purpose: the episode banner above it is Home's one loud theatrical element.
export function DeadlineStub({
  label,
  note,
  ctaLabel,
  href,
  className,
}: {
  label: string;
  note?: string;
  ctaLabel: string;
  href: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "relative flex min-w-0 flex-col rounded-xl border border-primary/25 bg-curtain/40 px-3.5 py-2.5",
        className
      )}
    >
      <span className="absolute top-1/2 -left-[6px] size-3 -translate-y-1/2 rounded-full bg-background" />
      <span className="absolute top-1/2 -right-[6px] size-3 -translate-y-1/2 rounded-full bg-background" />
      <p className="truncate font-heading text-sm font-semibold text-foreground">{label}</p>
      <p className="mt-0.5 truncate text-xs font-semibold text-accent">
        {ctaLabel} ›{note && <span className="ml-1.5 font-normal text-muted-foreground">{note}</span>}
      </p>
    </Link>
  );
}
