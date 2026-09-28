"use client";

import type { ReactNode } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "cn";

function formatWeight(weight: number) {
  if (!Number.isFinite(weight)) return "—";
  return Number.isInteger(weight) ? weight.toFixed(1) : String(weight);
}

// The module section opens onto its weight. Scoring Details is the only
// nested expand — there is no Scoring Mix accordion between them.
export function ScoringModulePanel({
  name,
  icon,
  weight,
  canEdit = false,
  weightInputId,
  onWeightChange,
  weightDisabled = false,
  detailsHint,
  locked = false,
  footer,
  children,
}: {
  name: string;
  icon: string;
  weight: number;
  canEdit?: boolean;
  weightInputId?: string;
  onWeightChange?: (value: number) => void;
  weightDisabled?: boolean;
  detailsHint?: string;
  locked?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className={cn("gap-0 py-0", locked && "ring-primary/40")}>
      <Accordion>
        <AccordionItem value="section" className="border-b-0">
          <AccordionTrigger className="items-center px-4 py-3.5 hover:no-underline">
            <span className="flex min-w-0 flex-1 items-center gap-2.5 pr-2">
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-base"
              >
                {icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate font-heading text-base leading-tight font-semibold">{name}</span>
                  <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-accent uppercase">
                    On
                  </span>
                  {locked && (
                    <span className="shrink-0 rounded-full border border-primary/40 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-accent uppercase">
                      Locked
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs font-normal text-muted-foreground group-aria-expanded/accordion-trigger:hidden">
                  Weight {formatWeight(weight)}
                  {locked ? " · deadline passed" : ""}
                </span>
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-4 [&_p]:mb-0!">
            <div className="flex flex-col gap-3 pb-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  {canEdit ? (
                    <Label htmlFor={weightInputId}>{name} Weight</Label>
                  ) : (
                    <p className="text-sm leading-none font-medium">{name} Weight</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">How much {name} counts toward Standings.</p>
                </div>
                {canEdit ? (
                  <Input
                    id={weightInputId}
                    type="number"
                    step="any"
                    min={0}
                    value={weight}
                    aria-label={`${name} weight`}
                    onChange={(e) => onWeightChange?.(Number(e.target.value))}
                    disabled={weightDisabled}
                    className="h-11 w-24 shrink-0 text-center text-base font-semibold text-accent"
                  />
                ) : (
                  <span className="flex h-11 w-24 shrink-0 items-center justify-center rounded-lg border border-border text-base font-semibold">
                    {formatWeight(weight)}
                  </span>
                )}
              </div>
              <Accordion>
                <AccordionItem value="details" className="border-b-0">
                  <AccordionTrigger className="items-center rounded-lg border border-border px-3 hover:no-underline">
                    <span className="flex min-w-0 flex-1 items-center gap-2 pr-2">
                      <span className="shrink-0">Scoring Details</span>
                      <span className="sr-only"> for {name}</span>
                      {detailsHint && (
                        <span className="ml-auto truncate text-xs font-normal text-muted-foreground">{detailsHint}</span>
                      )}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="px-0.5 [&_p]:mb-0!">
                    <div className="pt-3">{children}</div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
              {footer}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}
