"use client";

import { useState } from "react";
import { resetDraft } from "@/app/leagues/[id]/draft/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetDraftDialog({
  leagueId,
  leagueName,
  onReset,
}: {
  leagueId: string;
  leagueName: string;
  onReset?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReset() {
    setResetting(true);
    setError(null);
    const result = await resetDraft(leagueId);
    setResetting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    setConfirmName("");
    onReset?.();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="destructive" size="sm" />}>
        Reset Draft
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset {leagueName}&apos;s draft?</DialogTitle>
          <DialogDescription>
            This deletes every pick, every roster (including waiver moves), and all weekly
            scores for this league, then returns the draft to the lobby. Draft order,
            predictions, and scoring settings are kept. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="confirmResetName">
            Type <span className="font-medium text-foreground">{leagueName}</span> to confirm
          </Label>
          <Input
            id="confirmResetName"
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            variant="destructive"
            disabled={confirmName !== leagueName || resetting}
            onClick={handleReset}
          >
            {resetting ? "Resetting..." : "Reset draft permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
