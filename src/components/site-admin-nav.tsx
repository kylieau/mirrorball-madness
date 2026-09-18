import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const LINKS = [
  { href: "/admin/results", label: "Results" },
  { href: "/admin/accounts", label: "Account deletions" },
] as const;

export function SiteAdminNav() {
  return (
    <Card>
      <CardContent className="flex flex-col p-0">
        <p className="px-4 pt-3 pb-1 text-xs font-medium text-muted-foreground">Site Admin</p>
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center justify-between border-t border-border px-4 py-3 text-sm font-medium transition-colors first:border-t-0 hover:bg-muted"
          >
            <span>{link.label}</span>
            <ChevronRightIcon className="size-4 text-muted-foreground" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
