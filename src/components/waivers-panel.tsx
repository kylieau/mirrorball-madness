"use client";

import { useState } from "react";
import Link from "next/link";
import { XIcon } from "lucide-react";
import {
  submitWaiverClaim,
  processReverseStandingsWaivers,
  approveWaiverClaim,
  rejectWaiverClaim,
} from "@/app/leagues/[id]/waivers/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CoupleNameParts } from "@/lib/couple-display";
import { CoupleName, coupleNameNode } from "@/components/couple-name";
import { RecastCatchUpCard } from "@/components/recast-catch-up-card";

type Couple = { id: string; celebrity_name: string; pro_name: string };
type OpenSlot = { slotNumber: number; formerCoupleName: string };
type Claim = {
  id: string;
  managerName: string;
  coupleName: string;
  slotNumber: number;
  status: string;
  createdAt: string;
};

export function WaiversPanel({
  leagueId,
  closeHref,
  claimMethod,
  isCommissioner,
  openSlots,
  hiddenOpenSlotCount = 0,
  pendingRevealWeek = null,
  availableCouples,
  coupleDisplayNames,
  claims,
}: {
  leagueId: string;
  closeHref: string;
  claimMethod: string;
  isCommissioner: boolean;
  openSlots: OpenSlot[];
  hiddenOpenSlotCount?: number;
  pendingRevealWeek?: number | null;
  availableCouples: Couple[];
  coupleDisplayNames: Record<string, CoupleNameParts>;
  claims: Claim[];
}) {
  const [selections, setSelections] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function coupleParts(c: Couple): CoupleNameParts {
    return coupleDisplayNames[c.id] ?? { celebrity: c.celebrity_name, pro: c.pro_name };
  }
  const coupleItems = Object.fromEntries(
    availableCouples.map((c) => [c.id, coupleNameNode(coupleParts(c))])
  );

  async function handleClaim(slotNumber: number) {
    const coupleId = selections[slotNumber];
    if (!coupleId) return;
    setError(null);
    setMessage(null);
    setBusy(true);
    const result = await submitWaiverClaim(leagueId, slotNumber, coupleId);
    if (result.error) setError(result.error);
    else setMessage("Recast submitted.");
    setBusy(false);
  }

  async function handleProcess() {
    setError(null);
    setMessage(null);
    setBusy(true);
    const result = await processReverseStandingsWaivers(leagueId);
    if (result.error) setError(result.error);
    else setMessage("Recasts processed.");
    setBusy(false);
  }

  async function handleApprove(claimId: string) {
    setError(null);
    setBusy(true);
    const result = await approveWaiverClaim(leagueId, claimId);
    if (result.error) setError(result.error);
    setBusy(false);
  }

  async function handleReject(claimId: string) {
    setError(null);
    setBusy(true);
    const result = await rejectWaiverClaim(leagueId, claimId);
    if (result.error) setError(result.error);
    setBusy(false);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <Link href={closeHref} aria-label="Close" className="text-muted-foreground hover:text-foreground">
        <XIcon className="size-5" />
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Recast</h1>
        <p className="mt-1 text-sm capitalize text-muted-foreground">
          {claimMethod.replace("_", " ")} recast method
        </p>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        {message && <p className="mt-2 text-sm text-muted-foreground">{message}</p>}
      </div>

      {hiddenOpenSlotCount > 0 && openSlots.length === 0 && (
        <RecastCatchUpCard pendingRevealWeek={pendingRevealWeek} />
      )}

      {openSlots.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Your Open Slots</CardTitle>
            <CardDescription>Recast a replacement from the available couples.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {openSlots.map((slot) => (
              <div key={slot.slotNumber} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <span className="text-sm text-muted-foreground sm:w-40 sm:shrink-0">
                  Slot {slot.slotNumber} ({slot.formerCoupleName})
                </span>
                <Select
                  items={coupleItems}
                  value={selections[slot.slotNumber] ?? ""}
                  onValueChange={(v) =>
                    setSelections((prev) => ({ ...prev, [slot.slotNumber]: v ?? "" }))
                  }
                >
                  <SelectTrigger className="w-full sm:flex-1">
                    <SelectValue placeholder="Pick a Couple" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCouples.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {coupleItems[c.id]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={busy || !selections[slot.slotNumber]}
                  onClick={() => handleClaim(slot.slotNumber)}
                >
                  Recast
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Available Couples</CardTitle>
          <CardDescription>{availableCouples.length} on the wire</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {availableCouples.map((c) => (
            <p key={c.id} className="text-sm">
              <CoupleName {...coupleParts(c)} />
            </p>
          ))}
        </CardContent>
      </Card>

      {isCommissioner && claimMethod === "reverse_standings" && (
        <Button onClick={handleProcess} disabled={busy}>
          Process pending recasts
        </Button>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recasts</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {claims.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-sm">
              <span>
                {c.managerName} → {c.coupleName} (slot {c.slotNumber})
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <span className="capitalize text-muted-foreground">{c.status}</span>
                {isCommissioner && claimMethod === "manual" && c.status === "pending" && (
                  <>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => handleApprove(c.id)}>
                      Approve
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => handleReject(c.id)}>
                      Reject
                    </Button>
                  </>
                )}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
