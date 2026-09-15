import type { ReactNode } from "react";
import Link from "next/link";
import { AccountSettingsSheet } from "@/components/account-settings-sheet";
import type { AccountSettingsData } from "@/lib/account-settings-data";

// Shared brand mark + optional league-scoped action + avatar, used by every
// top-level page (Home, This Week, League, Leagues-browse, Notifications).
// Previously hand-duplicated three times (league-header.tsx, today/page.tsx,
// this-week/page.tsx) with no shared component and one real divergence bug
// (today/page.tsx's gear and avatar both linked to the same href). No gear
// icon lives here — the only settings entry points in the shared bar are
// the avatar (Account Settings); a league's own settings are reached via
// the gear on its Home card / switcher row, not from this bar.
export function TopBar({
  actionSlot,
  email,
  ...accountSettingsData
}: AccountSettingsData & {
  actionSlot?: ReactNode;
  email: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <Link href="/today" className="text-xs font-medium text-muted-foreground">
        🪩 Mirrorball Madness
      </Link>
      <div className="flex gap-2">
        {actionSlot}
        <AccountSettingsSheet email={email} {...accountSettingsData} />
      </div>
    </div>
  );
}
