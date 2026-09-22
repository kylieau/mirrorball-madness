import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { SettingsSection } from "@/components/settings-section";

const ROW_CLASSES =
  "flex items-center justify-between border-t border-border px-4 py-3 text-sm transition-colors first:border-t-0 hover:bg-muted";

// Results is its own Account Settings section, peer to Account-Wide / League
// Settings / Site Admin, because viewing how scores and outcomes get entered
// is open to every signed-in user — it isn't admin-only. Entering results
// needs the propose tier (any league's commissioner); publishing, the Schedule
// edit controls, and Show Settings stay admin-only and live under Site Admin.
export function ResultsNav({ canPropose }: { canPropose: boolean }) {
  return (
    <SettingsSection title="Results">
      <Link href="/admin/results?tab=view" className={ROW_CLASSES}>
        <span>
          <span className="block">View Results</span>
          <span className="block text-xs font-normal text-muted-foreground">
            Judges&apos; scores and outcomes, week by week
          </span>
        </span>
        <ChevronRightIcon className="size-4 text-muted-foreground" />
      </Link>

      <Link href="/admin/results?tab=schedule" className={ROW_CLASSES}>
        <span>
          <span className="block">Schedule</span>
          <span className="block text-xs font-normal text-muted-foreground">
            When each episode airs and what it features
          </span>
        </span>
        <ChevronRightIcon className="size-4 text-muted-foreground" />
      </Link>

      {canPropose && (
        <Link href="/admin/results?tab=enter" className={ROW_CLASSES}>
          <span>
            <span className="block">Enter Results</span>
            <span className="block text-xs font-normal text-muted-foreground">
              Draft a week&apos;s scores for a site admin to publish
            </span>
          </span>
          <ChevronRightIcon className="size-4 text-muted-foreground" />
        </Link>
      )}
    </SettingsSection>
  );
}
