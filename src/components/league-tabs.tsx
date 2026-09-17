"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { HomeIcon, PencilLineIcon, ListChecksIcon, TrophyIcon } from "lucide-react";

// Overrides TabsTrigger's default "boxed pill" active state (bg/border/
// shadow) so the active tab matches the plain color-only treatment the
// Home/This Week tabs use (a Link, not a TabsTrigger, so they never had
// that default styling to begin with).
const TAB_ITEM_CLASSES =
  "h-auto flex-1 flex-col gap-0.5 rounded-md px-2 py-1.5 text-muted-foreground hover:text-foreground data-active:bg-transparent data-active:text-accent group-data-[variant=default]/tabs-list:data-active:shadow-none dark:data-active:bg-transparent dark:data-active:border-transparent dark:data-active:text-accent sm:flex-row sm:gap-1.5 sm:px-3";

const LINK_ITEMS = [
  { href: "/today", label: "Home", icon: HomeIcon },
  { href: "/this-week", label: "This week", icon: ListChecksIcon },
] as const;

const TABS = [
  { value: "yourpicks", label: "Your picks", icon: PencilLineIcon },
  { value: "standings", label: "Standings", icon: TrophyIcon },
] as const;

export function LeagueTabs({
  yourPicks,
  standings,
}: {
  yourPicks: ReactNode;
  standings: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "yourpicks";

  function handleValueChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    // The "League created!" banner is a one-time toast tied to the first
    // visit (Your Picks is the landing tab) — leaving it counts as
    // acknowledging the banner, so drop it from the URL here rather than
    // tracking dismissal separately. Once it's gone from the params,
    // nothing re-adds it, so it can't resurface.
    if (value !== "yourpicks") {
      params.delete("justCreated");
      params.delete("week");
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <Tabs value={activeTab} onValueChange={handleValueChange}>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] sm:static sm:border-t-0 sm:border-b sm:pb-0">
        <TabsList className="h-auto w-full justify-around rounded-none bg-transparent p-1 group-data-horizontal/tabs:h-auto sm:w-fit sm:justify-start sm:gap-1">
          {LINK_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`inline-flex items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground ${TAB_ITEM_CLASSES}`}
            >
              <Icon className="size-5 sm:size-4" />
              <span className="text-[10px] sm:text-sm">{label}</span>
            </Link>
          ))}
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value} className={TAB_ITEM_CLASSES}>
              <Icon className="size-5 sm:size-4" />
              <span className="text-[10px] sm:text-sm">{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <div className="pb-20 sm:pb-0">
        <TabsContent value="yourpicks">{yourPicks}</TabsContent>
        <TabsContent value="standings">{standings}</TabsContent>
      </div>
    </Tabs>
  );
}
