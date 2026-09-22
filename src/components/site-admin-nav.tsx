import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { SettingsSection } from "@/components/settings-section";

// Results entry itself lives in the Results section (ResultsNav) — it isn't
// admin-only. What stays here is strictly is_super_admin: the deletion queue,
// and the season/judges/dance-styles config behind Show Settings.
const LINKS = [
  { href: "/admin/accounts", label: "Accounts" },
  { href: "/admin/show-settings", label: "Show Settings" },
] as const;

export function SiteAdminNav() {
  return (
    <SettingsSection title="Site Admin">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="flex items-center justify-between border-t border-border px-4 py-3 text-sm transition-colors first:border-t-0 hover:bg-muted"
        >
          <span>{link.label}</span>
          <ChevronRightIcon className="size-4 text-muted-foreground" />
        </Link>
      ))}
    </SettingsSection>
  );
}
