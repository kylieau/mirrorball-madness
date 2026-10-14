import type { ReactNode } from "react";

// The shared title + gold rule every tab opens with, so Home/Results/Picks/
// Standings all read as the same kind of screen. `children`, when given, is
// the tab-specific "switcher" slot directly under the rule — the league
// switcher on Picks/Standings, the episode carousel on Results, nothing on
// Home.
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">{title}</h1>
      <div className="mt-2 h-0.5 w-9 rounded-full bg-primary" />
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}
