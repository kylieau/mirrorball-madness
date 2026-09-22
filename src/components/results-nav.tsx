import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { SettingsSection } from "@/components/settings-section";

const ROW_CLASSES =
  "flex items-center justify-between border-t border-border px-4 py-3 text-sm transition-colors first:border-t-0 hover:bg-muted";

function Row({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className={ROW_CLASSES}>
      <span>{label}</span>
      <ChevronRightIcon className="size-4 text-muted-foreground" />
    </Link>
  );
}

// Episodes is its own Account Settings section, peer to Account-Wide / League
// Settings / Site Admin, because viewing how scores and outcomes get entered
// is open to every signed-in user — it isn't admin-only. Schedule is its own
// page (/admin/schedule) rather than folded into Scores — it isn't really a
// "scores view," unlike By Week and By Couple, which are just two lenses on
// the same data and stay collapsed into one "Scores" row; clicking it lands
// on the Scores page's own By Week/By Couple switcher (results-screen.tsx)
// rather than each getting a separate settings row. Entering results needs
// the propose tier (any league's commissioner); publishing and Show Settings
// stay admin-only and live under Site Admin.
export function ResultsNav({ canPropose }: { canPropose: boolean }) {
  return (
    <SettingsSection title="Episodes">
      <Row href="/admin/schedule" label="Schedule" />
      <Row href="/admin/results?tab=week" label="Scores" />
      {canPropose && <Row href="/admin/results?tab=enter" label="Enter Results" />}
    </SettingsSection>
  );
}
