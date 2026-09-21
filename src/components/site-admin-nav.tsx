import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { SettingsSection } from "@/components/settings-section";

const LINKS = [
  { href: "/admin/results", label: "Results" },
  { href: "/admin/accounts", label: "Accounts" },
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
