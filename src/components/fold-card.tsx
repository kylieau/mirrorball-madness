"use client";

import { useState, type ReactNode } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

// A card that opens on tap, for the reference a page keeps under the
// viewer's own to-do (an order, a log, the rules): one row with its title and
// a short note until it is wanted.
export function FoldCard({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-(--card-spacing) text-left"
      >
        <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5">
          <span className="font-heading text-base leading-snug font-medium">{title}</span>
          {note && <span className="text-xs text-muted-foreground">{note}</span>}
        </span>
        {open ? (
          <ChevronUpIcon className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      {open && <CardContent>{children}</CardContent>}
    </Card>
  );
}
