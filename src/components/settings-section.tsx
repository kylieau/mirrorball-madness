import type { ReactNode } from "react";

// The labeled group used on Account settings (sheet and /settings page):
// an accent heading above a bordered list of rows.
export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-sm font-semibold text-accent">{title}</h2>
      <div className="rounded-2xl border border-border">{children}</div>
    </section>
  );
}
