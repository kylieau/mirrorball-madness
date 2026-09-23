import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import type { AccountSettingsLeague } from "@/lib/account-settings-data";
import { SettingsSection } from "@/components/settings-section";

// The one way in to a league's own settings. Commissioners edit; everyone
// else gets the read-only view of the same page.
export function LeagueSettingsLinks({
  leagues,
  fromHref,
}: {
  leagues: AccountSettingsLeague[];
  fromHref: string;
}) {
  if (leagues.length === 0) return null;

  return (
    <SettingsSection title="League Settings">
      {leagues.map((l) => (
          <Link
            key={l.id}
            href={`/leagues/${l.id}/settings?from=${encodeURIComponent(fromHref)}`}
            className="flex w-full items-center justify-between border-t border-border px-4 py-3 text-left text-sm transition-colors first:border-t-0 hover:bg-muted"
          >
            <span>{l.name}</span>
            <ChevronRightIcon className="size-4 text-muted-foreground" />
          </Link>
      ))}
    </SettingsSection>
  );
}
