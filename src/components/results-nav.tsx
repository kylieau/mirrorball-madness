import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { SettingsSection } from "@/components/settings-section";

const ROW_CLASSES =
  "flex items-center justify-between border-t border-border px-4 py-3 text-sm transition-colors first:border-t-0 hover:bg-muted";

function Row({ href, label, hint }: { href: string; label: string; hint: string }) {
  return (
    <Link href={href} className={ROW_CLASSES}>
      <span>
        <span className="block">{label}</span>
        <span className="block text-xs font-normal text-muted-foreground">{hint}</span>
      </span>
      <ChevronRightIcon className="size-4 text-muted-foreground" />
    </Link>
  );
}

// Episodes is its own Account Settings section, peer to Account-Wide / League
// Settings / Site Admin, because viewing how scores and outcomes get entered
// is open to every signed-in user — it isn't admin-only. Schedule, Results by
// Week, and Results by Couple are each a direct row (not funneled through one
// umbrella row) so all three are discoverable from Settings without an extra
// hop through the page's own switcher first; that switcher (results-screen.tsx)
// still lets you hop between them once you're in, in this same order, so
// there's no order-vs-order mismatch to keep in sync. Entering results needs
// the propose tier (any league's commissioner); publishing and Show Settings
// stay admin-only and live under Site Admin.
export function ResultsNav({ canPropose }: { canPropose: boolean }) {
  return (
    <SettingsSection title="Episodes">
      <Row
        href="/admin/results?tab=schedule"
        label="Schedule"
        hint="When each episode airs and what it features"
      />
      <Row
        href="/admin/results?tab=week"
        label="Results by Week"
        hint="Judges' scores and outcomes, grouped by episode"
      />
      <Row
        href="/admin/results?tab=couple"
        label="Results by Couple"
        hint="Judges' scores and outcomes, grouped by couple"
      />
      {canPropose && (
        <Row
          href="/admin/results?tab=enter"
          label="Enter Results"
          hint="Draft a week's scores for a site admin to publish"
        />
      )}
    </SettingsSection>
  );
}
