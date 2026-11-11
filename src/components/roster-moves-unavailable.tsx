import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";

// Why a Lifeline, Recast or Trades page has nothing to show (the mechanism is
// off, or the draft isn't done), with the same back link as the full page.
export function RosterMovesUnavailable({
  back,
  title,
  body,
}: {
  back: { href: string; label: string };
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center gap-4 px-4 py-24 text-center">
      <Link
        href={back.href}
        className="flex items-center gap-0.5 self-start text-sm text-muted-foreground no-underline hover:text-foreground"
      >
        <ChevronLeftIcon aria-hidden className="size-4" />
        {back.label}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
