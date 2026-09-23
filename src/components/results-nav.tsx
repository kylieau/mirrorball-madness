"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { SettingsSection } from "@/components/settings-section";

const ROW_CLASSES =
  "flex items-center justify-between border-t border-border px-4 py-3 text-sm transition-colors first:border-t-0 hover:bg-muted";

const SUB_ROW_CLASSES =
  "flex items-center justify-between py-2.5 pl-8 pr-4 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

function Row({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className={ROW_CLASSES}>
      <span>{label}</span>
      <ChevronRightIcon className="size-4 text-muted-foreground" />
    </Link>
  );
}

// Collapsed by default — hand-styled to match Row/SUB_ROW_CLASSES rather
// than the shared Accordion component, whose own defaults (rounded-lg
// trigger, hover:underline, padded differently) don't match this list's
// plain-row look without fighting them via overrides.
function ScoresRow() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen((o) => !o)} className={`${ROW_CLASSES} w-full text-left`}>
        <span>Scores</span>
        <ChevronRightIcon
          className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && (
        <>
          <Link href="/admin/results?tab=week" className={SUB_ROW_CLASSES}>
            <span>By Week</span>
            <ChevronRightIcon className="size-4 text-muted-foreground" />
          </Link>
          <Link href="/admin/results?tab=couple" className={`${SUB_ROW_CLASSES} border-t border-border`}>
            <span>By Couple</span>
            <ChevronRightIcon className="size-4 text-muted-foreground" />
          </Link>
        </>
      )}
    </>
  );
}

// Episodes is its own Account Settings section, peer to Account-Wide / League
// Settings / Site Admin, because viewing how scores and outcomes get entered
// is open to every signed-in user — it isn't admin-only. Schedule is its own
// page (/admin/schedule) rather than folded into Scores — it isn't really a
// "scores view," unlike By Week and By Couple, which are just two lenses on
// the same data and expand in place under "Scores" (ScoresRow) rather than
// navigating anywhere on their own. results-screen.tsx's own By Week/By
// Couple switcher is only for flipping between the two once you're already
// on the page. Entering results needs the propose tier (any league's
// commissioner); publishing and Show Settings stay admin-only and live under
// Site Admin.
export function ResultsNav({ canPropose }: { canPropose: boolean }) {
  return (
    <SettingsSection title="Episodes">
      <Row href="/admin/schedule" label="Schedule" />
      <ScoresRow />
      {canPropose && <Row href="/admin/results?tab=enter" label="Enter Results" />}
    </SettingsSection>
  );
}
