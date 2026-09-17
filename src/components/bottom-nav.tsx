import type { ReactNode } from "react";
import Link from "next/link";
import { HomeIcon, ListChecksIcon, PencilLineIcon, TrophyIcon, type LucideIcon } from "lucide-react";

/** Clears page content so it isn't hidden behind the always-sticky bar. */
export const BOTTOM_NAV_CLEARANCE = "pb-20";

/** Sit a second sticky bar (e.g. admin Save/Publish) just above the tab bar. */
export const BOTTOM_NAV_STACK_ABOVE =
  "bottom-[calc(5rem+env(safe-area-inset-bottom))]";

export const BOTTOM_NAV_TABS_CLASS =
  "flex h-auto w-full justify-around bg-transparent p-1";

const ITEM_CLASS =
  "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-2 py-1.5 text-sm font-medium sm:flex-row sm:gap-1.5 sm:px-3";

export function BottomNav({ children }: { children: ReactNode }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40">
      <div className="mx-auto w-full max-w-2xl border-t border-border bg-background px-4 pb-[env(safe-area-inset-bottom)]">
        {children}
      </div>
    </nav>
  );
}

type FanTab = "home" | "results" | "picks" | "standings";

function FanTabItem({
  href,
  active,
  icon: Icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: LucideIcon;
  label: string;
}) {
  const className = `${ITEM_CLASS} ${active ? "text-accent" : "text-muted-foreground hover:text-foreground"}`;
  const body = (
    <>
      <Icon className="size-5 sm:size-4" />
      <span className="text-[10px] sm:text-sm">{label}</span>
    </>
  );
  if (active) {
    return <span className={className}>{body}</span>;
  }
  return (
    <Link href={href} className={className}>
      {body}
    </Link>
  );
}

export function FanBottomNav({
  active,
  leagueId,
}: {
  active: FanTab;
  leagueId: string;
}) {
  return (
    <BottomNav>
      <div className={BOTTOM_NAV_TABS_CLASS}>
        <FanTabItem href="/today" active={active === "home"} icon={HomeIcon} label="Home" />
        <FanTabItem href="/this-week" active={active === "results"} icon={ListChecksIcon} label="Results" />
        <FanTabItem
          href={`/leagues/${leagueId}?tab=yourpicks`}
          active={active === "picks"}
          icon={PencilLineIcon}
          label="Picks"
        />
        <FanTabItem
          href={`/leagues/${leagueId}?tab=standings`}
          active={active === "standings"}
          icon={TrophyIcon}
          label="Standings"
        />
      </div>
    </BottomNav>
  );
}
