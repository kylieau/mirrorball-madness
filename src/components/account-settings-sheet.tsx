"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ChevronRightIcon } from "lucide-react";
import { ProfileForm } from "@/components/profile-form";
import { AccountDataForm } from "@/components/account-data-form";
import { SpoilerModeToggle } from "@/components/spoiler-mode-toggle";
import { ADD_TO_HOME_SCREEN_COPY } from "@/lib/add-to-home-screen";
import { SiteAdminNav } from "@/components/site-admin-nav";
import { ResultsNav } from "@/components/results-nav";
import { LeagueSettingsLinks } from "@/components/league-settings-links";
import { SettingsSection } from "@/components/settings-section";
import type { AccountSettingsData } from "@/lib/account-settings-data";

const ROW_CLASSES =
  "flex w-full items-center justify-between border-t border-border px-4 py-3 text-left text-sm transition-colors first:border-t-0 hover:bg-muted";

// The avatar trigger present on every top-level page (via TopBar). Replaces
// /settings + /settings/profile + /settings/account as the primary path —
// those routes stay live as deep-link fallbacks, but saving from here never
// navigates away: Profile and Account & data are nested Dialogs sharing the
// same form components those fallback pages use, so a save just updates
// this sheet in place. Notifications stays a plain Link (a scrollable
// content list, not a settings form — see BACKLOG.md). Add to Home Screen
// is its own page (`/settings/add-to-home-screen`), not nested under
// Notifications. Results is its own section, shown to everyone — viewing how
// scores get entered isn't admin-only — with its Enter Results row gated on
// the propose tier. Site Admin stays super-admin: Accounts + Show Settings.
export function AccountSettingsSheet({
  displayName,
  isSuperAdmin,
  deletionRequestedAt,
  spoilerFreeMode,
  leagues,
  canProposeResults,
  email,
}: AccountSettingsData & { email: string }) {
  // League settings' Back/✕ returns to wherever this sheet was opened from.
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const currentPath = query ? `${pathname}?${query}` : pathname;

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button size="icon-sm" aria-label="Account settings" className="rounded-full font-bold" />
        }
      >
        {displayName.charAt(0).toUpperCase()}
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-4 pb-4">
          <SettingsSection title="Account-Wide">
            <Dialog>
              <DialogTrigger className={ROW_CLASSES}>
                <span>Profile</span>
                <ChevronRightIcon className="size-4 text-muted-foreground" />
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Profile</DialogTitle>
                </DialogHeader>
                <ProfileForm displayName={displayName} />
              </DialogContent>
            </Dialog>

            <SpoilerModeToggle initialEnabled={spoilerFreeMode} />

            <Link href="/notifications" className={ROW_CLASSES}>
              <span>Notifications</span>
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            </Link>

            <Link href="/settings/add-to-home-screen" className={ROW_CLASSES}>
              <span>
                <span className="block">{ADD_TO_HOME_SCREEN_COPY.title}</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {ADD_TO_HOME_SCREEN_COPY.detail}
                </span>
              </span>
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            </Link>

            <Dialog>
              <DialogTrigger className={ROW_CLASSES}>
                <span>Account &amp; Data</span>
                <ChevronRightIcon className="size-4 text-muted-foreground" />
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Account &amp; Data</DialogTitle>
                </DialogHeader>
                <AccountDataForm email={email} deletionRequestedAt={deletionRequestedAt} />
              </DialogContent>
            </Dialog>
          </SettingsSection>

          <LeagueSettingsLinks leagues={leagues} fromHref={currentPath} />

          <ResultsNav canPropose={canProposeResults} />

          {isSuperAdmin && <SiteAdminNav />}

          <form action={signOut}>
            <Button type="submit" variant="outline" className="w-full">
              Sign Out
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
