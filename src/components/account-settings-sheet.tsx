"use client";

import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
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
import type { AccountSettingsData } from "@/lib/account-settings-data";
import { cn } from "cn";

const ROW_CLASSES =
  "flex w-full items-center justify-between border-t border-border px-4 py-3 text-left text-sm transition-colors first:border-t-0 hover:bg-muted";

// The avatar trigger present on every top-level page (via TopBar). Replaces
// /settings + /settings/profile + /settings/account as the primary path —
// those routes stay live as deep-link fallbacks, but saving from here never
// navigates away: Profile and Account & data are nested Dialogs sharing the
// same form components those fallback pages use, so a save just updates
// this sheet in place. Notifications stays a plain Link (a scrollable
// content list, not a settings form — see BACKLOG.md) and Admin stays a
// Link to the separate /admin/results surface.
export function AccountSettingsSheet({
  displayName,
  isSuperAdmin,
  deletionRequestedAt,
  spoilerFreeMode,
  email,
}: AccountSettingsData & { email: string }) {
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
          <SheetDescription>Account-wide</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-4 pb-4">
          <div className="rounded-2xl border border-border">
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

            <Link href="/notifications" className={ROW_CLASSES}>
              <span>Notifications</span>
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            </Link>

            <div className={cn(ROW_CLASSES, "text-muted-foreground hover:bg-transparent")}>
              <span>Appearance</span>
              <span className="text-xs">Coming soon</span>
            </div>

            <SpoilerModeToggle initialEnabled={spoilerFreeMode} />

            <Dialog>
              <DialogTrigger className={ROW_CLASSES}>
                <span>Account &amp; data</span>
                <ChevronRightIcon className="size-4 text-muted-foreground" />
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Account &amp; Data</DialogTitle>
                </DialogHeader>
                <AccountDataForm email={email} deletionRequestedAt={deletionRequestedAt} />
              </DialogContent>
            </Dialog>
          </div>

          {isSuperAdmin && (
            <Link
              href="/admin/results"
              className="flex items-center justify-between rounded-2xl border border-border px-4 py-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              <span>Site Admin</span>
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            </Link>
          )}

          <form action={signOut}>
            <Button type="submit" variant="outline" className="w-full">
              Sign out
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
