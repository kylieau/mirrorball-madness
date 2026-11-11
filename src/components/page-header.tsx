import type { ReactNode } from "react";

// The shared title + gold rule every tab opens with, so Home/Results/Picks/
// Standings all read as the same kind of screen. `trailing` sits on the
// title row, right-aligned (the league switcher on Picks/Standings, the week
// carousel on Results); `children`, when given, is the slot directly under
// the rule (the view tabs on Scores).
export function PageHeader({ title, trailing, children }: { title: string; trailing?: ReactNode; children?: ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="shrink-0 font-heading text-2xl font-semibold">{title}</h1>
        {trailing && <div className="flex min-w-0 items-center justify-end gap-3">{trailing}</div>}
      </div>
      <div className="mt-1 h-0.5 w-9 rounded-full bg-primary" />
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}
