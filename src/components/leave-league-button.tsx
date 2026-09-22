"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { leaveLeague } from "@/app/leagues/actions";
import { removeCoManager } from "@/app/leagues/[id]/settings/actions";
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

export function LeaveLeagueButton({
  leagueId,
  leagueName,
  isCommissioner,
  isCoManager = false,
  hasCoManager = false,
  teamUserId,
}: {
  leagueId: string;
  leagueName: string;
  isCommissioner: boolean;
  // Whether the viewer is the co-manager half of this team (rather than the
  // primary) — a co-manager's own "leave" detaches them via remove_co_manager
  // instead of deleting the whole team through leave_league.
  isCoManager?: boolean;
  // Whether the viewer's own (primary) team currently has a co-manager
  // attached — leave_league blocks a primary from leaving until they detach
  // their co-manager first, so surface that instead of a confusing error.
  hasCoManager?: boolean;
  teamUserId?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isCommissioner) {
    return <span className="text-xs text-muted-foreground">Commissioners can&apos;t leave</span>;
  }

  if (hasCoManager && !isCoManager) {
    return (
      <span className="text-xs text-muted-foreground">
        Remove your co-manager in Settings before leaving
      </span>
    );
  }

  async function handleLeave() {
    setError(null);
    setSubmitting(true);
    const result =
      isCoManager && teamUserId ? await removeCoManager(leagueId, teamUserId) : await leaveLeague(leagueId);
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
    } else {
      router.refresh();
    }
  }

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Leave</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave {leagueName}?</DialogTitle>
          <DialogDescription>
            {isCoManager
              ? "You'll lose access to this team. The primary manager keeps the roster and history."
              : "You'll lose access to this league. Your historical scores stay on the record for the league's own standings."}
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button variant="destructive" onClick={handleLeave} disabled={submitting}>
            {submitting ? "Leaving..." : "Leave league"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
