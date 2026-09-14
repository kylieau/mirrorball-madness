"use client";

import { useState } from "react";
import Link from "next/link";
import { submitWaiverClaim } from "@/app/leagues/[id]/waivers/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { CoupleNameParts } from "@/lib/couple-display";
import { CoupleName } from "@/components/couple-name";

type OpenSlot = { slotNumber: number; formerCoupleName: string };
type Couple = { id: string; celebrity_name: string; pro_name: string };

export function RecastNudgeCard({
  leagueId,
  openSlots,
  availableCouples,
  coupleDisplayNames,
  claimMethod,
  priorityRank,
  totalManagers,
}: {
  leagueId: string;
  openSlots: OpenSlot[];
  availableCouples: Couple[];
  coupleDisplayNames: Record<string, CoupleNameParts>;
  claimMethod: string | null;
  priorityRank: number;
  totalManagers: number;
}) {
  const [claimedCoupleIds, setClaimedCoupleIds] = useState<Set<string>>(new Set());
  const [pendingCoupleId, setPendingCoupleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (openSlots.length < 1) return null;

  const singleSlot = openSlots.length === 1 ? openSlots[0] : null;

  async function handleClaim(coupleId: string) {
    if (!singleSlot) return;
    setError(null);
    setPendingCoupleId(coupleId);
    const result = await submitWaiverClaim(leagueId, singleSlot.slotNumber, coupleId);
    if (result.error) setError(result.error);
    else setClaimedCoupleIds((prev) => new Set(prev).add(coupleId));
    setPendingCoupleId(null);
  }

  function coupleParts(c: Couple): CoupleNameParts {
    return coupleDisplayNames[c.id] ?? { celebrity: c.celebrity_name, pro: c.pro_name };
  }

  return (
    <Sheet>
      <Card className="border-primary">
        <CardHeader>
          <CardTitle>Fill your open {openSlots.length === 1 ? "spot" : "spots"}</CardTitle>
          <CardDescription>
            {openSlots.length === 1
              ? "One of your couples is out — recast a replacement to keep scoring."
              : `${openSlots.length} of your couples are out — recast replacements to keep scoring.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SheetTrigger render={<Button size="sm" />}>Browse recast pool</SheetTrigger>
        </CardContent>
      </Card>

      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Recast</SheetTitle>
          <SheetDescription>
            {claimMethod === "reverse_standings"
              ? `Your recast priority: #${priorityRank} of ${totalManagers}`
              : claimMethod === "fcfs"
                ? "First come, first served — claims are final the moment you submit them."
                : "Your commissioner approves each claim manually."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 pb-4">
          {error && <p className="text-sm text-destructive">{error}</p>}

          {singleSlot ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                Open slot: was {singleSlot.formerCoupleName}
              </p>
              {availableCouples.map((c) => {
                const claimed = claimedCoupleIds.has(c.id);
                return (
                  <div key={c.id} className="flex items-center justify-between gap-3 text-sm">
                    <CoupleName {...coupleParts(c)} />
                    <Button
                      size="sm"
                      variant={claimed ? "outline" : "default"}
                      disabled={claimed || pendingCoupleId !== null}
                      onClick={() => handleClaim(c.id)}
                    >
                      {claimed ? "Pending" : "Claim"}
                    </Button>
                  </div>
                );
              })}
              {availableCouples.length === 0 && (
                <p className="text-sm text-muted-foreground">No couples available to recast right now.</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              You have {openSlots.length} open slots — head to the full{" "}
              <Link href={`/leagues/${leagueId}/waivers`} className="font-medium underline">
                Recast page
              </Link>{" "}
              to fill each one.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
