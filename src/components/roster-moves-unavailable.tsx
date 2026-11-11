import { RosterMovesBackLink } from "@/components/roster-moves-frame";

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
      <RosterMovesBackLink {...back} />
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
