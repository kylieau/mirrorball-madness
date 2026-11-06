import type { ReactNode } from "react";
import Link from "next/link";
import { coupleHistoryHref } from "@/lib/couple-history-link";
import type { CoupleNameParts } from "@/lib/couple-display";

// The show bills the celebrity as the star and the pro as their partner —
// bold the celebrity name wherever a couple is displayed, everywhere.
export function CoupleName({ celebrity, pro }: CoupleNameParts) {
  return (
    <>
      <strong>{celebrity}</strong> &amp; {pro}
    </>
  );
}

// A couple's name that opens its history page, which links back to `from`.
export function CoupleNameLink({ coupleId, from, ...parts }: CoupleNameParts & { coupleId: string; from: string }) {
  return (
    <Link href={coupleHistoryHref(coupleId, from)} className="hover:text-accent">
      <CoupleName {...parts} />
    </Link>
  );
}

export function coupleNameNode(parts: CoupleNameParts): ReactNode {
  return <CoupleName celebrity={parts.celebrity} pro={parts.pro} />;
}
