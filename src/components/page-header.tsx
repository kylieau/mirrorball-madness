import type { ReactNode } from "react";
import { cn } from "cn";

// The shared title + gold rule every tab opens with, so Home/Results/Picks/
// Standings all read as the same kind of screen. `aside` sits on the title's
// row (the league switcher on Picks/Standings); `children`, when given, is
// the switcher slot directly under the rule (the episode carousel on
// Results). `flush` drops the trailing margins for use inside
// `StickyPageHeader`, which supplies its own spacing.
export function PageHeader({
  title,
  aside,
  flush,
  children,
}: {
  title: string;
  aside?: ReactNode;
  flush?: boolean;
  children?: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">{title}</h1>
        {aside && <div className="min-w-0">{aside}</div>}
      </div>
      <div className={cn("mt-2.5 h-0.5 w-9 rounded-full bg-primary", !children && !flush && "mb-4")} />
      {children && <div className={cn("mt-2", !flush && "mb-4")}>{children}</div>}
    </div>
  );
}
