"use client";

import type { ReactNode } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// One enabled module: the header opens onto its Scoring Mix weight, and a
// nested accordion holds that module's own fields. Collapsed by default so
// League Settings stays a list of modules instead of every field at once.
export function ScoringModulePanel({
  name,
  icon,
  weight,
  canEdit = false,
  weightInputId,
  onWeightChange,
  weightDisabled = false,
  detailsDescription,
  belowMix,
  trailing,
  children,
}: {
  name: string;
  icon: string;
  weight: number;
  canEdit?: boolean;
  weightInputId?: string;
  onWeightChange?: (value: number) => void;
  weightDisabled?: boolean;
  detailsDescription: string;
  belowMix?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="gap-0 py-0">
      <Accordion>
        <AccordionItem value="mix" className="border-b-0">
          <AccordionTrigger className="items-center px-4 py-3.5 hover:no-underline">
            <span className="flex min-w-0 flex-1 items-center gap-2.5 pr-2">
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-base"
              >
                {icon}
              </span>
              <span className="min-w-0 truncate font-heading text-base leading-tight font-semibold">{name}</span>
              <span className="ml-auto flex shrink-0 items-center gap-2">
                {trailing}
                <span className="text-xs font-normal text-muted-foreground">Weight {weight}</span>
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-4 [&_p]:mb-0!">
            <div className="flex flex-col gap-3 pb-3">
              <div className="flex flex-col gap-2">
                {canEdit ? (
                  <Label htmlFor={weightInputId}>Scoring Mix</Label>
                ) : (
                  <p className="text-sm leading-none font-medium">Scoring Mix</p>
                )}
                <p className="text-xs text-muted-foreground">How much {name} counts toward Standings.</p>
                {canEdit ? (
                  <Input
                    id={weightInputId}
                    type="number"
                    step="0.1"
                    min={0}
                    value={weight}
                    aria-label={`${name} Scoring Mix`}
                    onChange={(e) => onWeightChange?.(Number(e.target.value))}
                    disabled={weightDisabled}
                    className="max-w-36"
                  />
                ) : (
                  <p className="text-sm font-medium">{weight}</p>
                )}
              </div>
              {belowMix}
              <Accordion>
                <AccordionItem value="details" className="border-b-0">
                  <AccordionTrigger className="items-center rounded-lg border border-border bg-muted/30 px-3 hover:no-underline">
                    Scoring Details
                    <span className="sr-only"> for {name}</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-0.5 [&_p]:mb-0!">
                    <div className="flex flex-col gap-3 pt-2">
                      <div className="text-sm text-muted-foreground">{detailsDescription}</div>
                      {children}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}
