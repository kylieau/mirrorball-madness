import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { AccountSettingsSheet } from "@/components/account-settings-sheet";
import type { AccountSettingsData } from "@/lib/account-settings-data";

// Shared brand mark + optional league-scoped action + avatar, used by every
// top-level page (Home, This Week, League, Leagues-browse, Notifications).
// Previously hand-duplicated three times (league-header.tsx, today/page.tsx,
// this-week/page.tsx) with no shared component and one real divergence bug
// (today/page.tsx's gear and avatar both linked to the same href). No gear
// icon lives here — the only settings entry point in the shared bar is the
// avatar (Account Settings), which also lists every league's own settings.
export function TopBar({
  actionSlot,
  email,
  ...accountSettingsData
}: AccountSettingsData & {
  actionSlot?: ReactNode;
  email: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Link href="/" className="flex h-7 items-center gap-1.5 text-sm font-semibold text-muted-foreground">
        <Image src="/mark-glyph.png" alt="" width={20} height={20} />
        Mirrorball Madness
      </Link>
      <div className="flex gap-2">
        {actionSlot}
        <AccountSettingsSheet email={email} {...accountSettingsData} />
      </div>
    </div>
  );
}

// TopBar pinned to the top of the page, for fan tabs with no strip. The strip
// chromes (HomeSpoilerChrome, HomeDraftChrome) stick the same bar with their
// strip underneath, so the wordmark + avatar never change between tabs.
export function StickyTopBar(props: Parameters<typeof TopBar>[0]) {
  return (
    <div className="sticky top-0 z-30 -mx-4 bg-background px-4 py-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
      <TopBar {...props} />
    </div>
  );
}
