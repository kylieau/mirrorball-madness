import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { AccountSettingsSheet } from "@/components/account-settings-sheet";
import { PinnedPageHeader } from "@/components/pinned-page-header";
import type { AccountSettingsData } from "@/lib/account-settings-data";

// Shared brand mark + avatar, used by every
// top-level page (Home, This Week, League, Leagues-browse, Notifications).
// Previously hand-duplicated three times (league-header.tsx, today/page.tsx,
// this-week/page.tsx) with no shared component and one real divergence bug
// (today/page.tsx's gear and avatar both linked to the same href). No gear
// icon lives here — the only settings entry point in the shared bar is the
// avatar (Account Settings), which also lists every league's own settings.
export function TopBar({ email, ...accountSettingsData }: AccountSettingsData & { email: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Wordmark />
      <AccountSettingsSheet email={email} {...accountSettingsData} />
    </div>
  );
}

function Wordmark() {
  return (
    <Link href="/" className="flex h-7 items-center gap-1.5 text-sm font-semibold text-muted-foreground">
      <Image src="/mark-glyph.png" alt="" width={20} height={20} />
      Mirrorball Madness
    </Link>
  );
}

// TopBar pinned to the top of the page, for pages with no page title of
// their own to pin (the couple page).
export function StickyTopBar(props: Parameters<typeof TopBar>[0]) {
  return (
    <div className="sticky top-0 z-30 -mx-4 bg-background px-4 py-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
      <TopBar {...props} />
    </div>
  );
}

// The fan tabs' chrome (Home, Results, Picks, Standings): the wordmark and
// avatar scroll away and the page title row stays pinned, with the tab's own
// control on its right (`trailing`, the league switcher; or `pinnedTrailing`,
// which takes over from the under-rule `children` once the block sticks:
// Results' week carousel) and the Spoiler-Free or draft `strip` under it, so
// the title and the strip move together.
export function FanPageChrome({
  title,
  trailing,
  pinnedTrailing,
  strip,
  children,
  email,
  ...accountSettingsData
}: AccountSettingsData & {
  email: string;
  title: string;
  trailing?: ReactNode;
  pinnedTrailing?: ReactNode;
  strip?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      <div className="pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        <TopBar {...accountSettingsData} email={email} />
      </div>
      <PinnedPageHeader title={title} trailing={trailing} pinnedTrailing={pinnedTrailing} strip={strip}>
        {children}
      </PinnedPageHeader>
    </>
  );
}
