"use client";

// Amber soft-inset rhyme of the Spoiler-Free soft inset: warm warning fill,
// one hairline under the sticky stack, gold (i) and no second Mark Watched
// button. Stickiness belongs to HomeDraftChrome so the wordmark, avatar, and
// this line move together (Pattern B). Shown only while this viewer can see
// a released draft, and it replaces the Spoiler-Free strip on every page
// that mounts it (Home, Results, Picks, Standings).

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TopBar } from "@/components/top-bar";
import type { AccountSettingsData } from "@/lib/account-settings-data";
import { DRAFT_SCORES_SHEET, DRAFT_SCORES_STRIP_LABEL } from "@/lib/draft-scores";

const STRIP_CLASSES =
  "flex min-h-[34px] items-center gap-1.5 border-b border-primary/35 bg-[#23180c] bg-[image:linear-gradient(180deg,rgba(84,56,16,0.92),rgba(36,24,10,0.9))] px-4 py-1.5";

export function HomeDraftChrome({
  email,
  actionSlot,
  ...accountSettingsData
}: AccountSettingsData & { email: string; actionSlot?: ReactNode }) {
  return (
    <div className="sticky top-0 z-30 -mx-4 bg-background pt-[env(safe-area-inset-top)]">
      <div className="px-4 py-2">
        <TopBar {...accountSettingsData} email={email} actionSlot={actionSlot} />
      </div>
      <DraftScoresStrip />
    </div>
  );
}

export function DraftScoresStrip() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className={STRIP_CLASSES}>
        <span className="size-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_0_2px_rgba(230,195,106,0.28)]" aria-hidden />
        <p className="min-w-0 flex-1 whitespace-nowrap text-xs font-semibold text-primary">{DRAFT_SCORES_STRIP_LABEL}</p>
        <button
          type="button"
          aria-label="About draft scores"
          onClick={() => setOpen(true)}
          className="relative grid size-6 shrink-0 place-items-center rounded-full border border-primary/80 font-heading text-[13px] font-semibold italic leading-none text-primary before:absolute before:-inset-2 before:content-['']"
        >
          i
        </button>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="items-center rounded-t-3xl px-5 pb-8 text-center">
          <SheetHeader className="items-center">
            <SheetTitle className="font-heading text-xl font-semibold">{DRAFT_SCORES_SHEET.title}</SheetTitle>
            <SheetDescription className="text-pretty">{DRAFT_SCORES_SHEET.body}</SheetDescription>
          </SheetHeader>
          <Button size="lg" className="w-full" onClick={() => setOpen(false)}>
            {DRAFT_SCORES_SHEET.primary}
          </Button>
        </SheetContent>
      </Sheet>
    </>
  );
}
