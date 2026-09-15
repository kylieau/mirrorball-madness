"use client";

import { useState } from "react";
import { renameLeague, deleteLeague } from "@/app/leagues/[id]/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingRow } from "@/components/setting-row";
import { CopyInviteLinkButton } from "@/components/copy-invite-link-button";
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

export function LeagueInfoSection({
  leagueId,
  leagueName,
  inviteCode,
  canEdit,
}: {
  leagueId: string;
  leagueName: string;
  inviteCode: string;
  canEdit: boolean;
}) {
  const [name, setName] = useState(leagueName);
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSaved, setNameSaved] = useState(false);

  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleRename() {
    setNameError(null);
    setNameSaved(false);
    if (!name.trim()) {
      setNameError("League name is required.");
      return;
    }
    setSavingName(true);
    const result = await renameLeague(leagueId, name.trim());
    if (result.error) setNameError(result.error);
    else setNameSaved(true);
    setSavingName(false);
  }

  async function handleDelete() {
    setDeleteError(null);
    setDeleting(true);
    const result = await deleteLeague(leagueId);
    // A successful delete redirects server-side and never returns here.
    if (result?.error) {
      setDeleteError(result.error);
      setDeleting(false);
    }
  }

  if (!canEdit) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>League Info</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col">
            <SettingRow label="Name" value={leagueName} />
            <SettingRow label="Invite code" value={<span className="font-mono">{inviteCode}</span>} />
          </div>
          <CopyInviteLinkButton inviteCode={inviteCode} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>League Info</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {nameError && <p className="text-sm text-destructive">{nameError}</p>}
        {nameSaved && <p className="text-sm text-muted-foreground">Name saved.</p>}
        <div className="flex flex-col gap-2">
          <Label htmlFor="leagueName">League Name</Label>
          <div className="flex gap-2">
            <Input id="leagueName" value={name} onChange={(e) => setName(e.target.value)} />
            <Button onClick={handleRename} disabled={savingName}>
              {savingName ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <SettingRow label="Invite code" value={<span className="font-mono">{inviteCode}</span>} />
          <CopyInviteLinkButton inviteCode={inviteCode} />
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <p className="text-sm font-medium text-destructive">Danger zone</p>
          <Dialog>
            <DialogTrigger render={<Button variant="destructive" className="self-start" />}>
              Delete league
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete {leagueName}?</DialogTitle>
                <DialogDescription>
                  This permanently deletes the league for every member — roster, draft
                  history, picks, and all scores. This can&apos;t be undone.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <Label htmlFor="confirmName">
                  Type <span className="font-medium text-foreground">{leagueName}</span> to confirm
                </Label>
                <Input
                  id="confirmName"
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                />
              </div>
              {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                <Button
                  variant="destructive"
                  disabled={confirmName !== leagueName || deleting}
                  onClick={handleDelete}
                >
                  {deleting ? "Deleting..." : "Delete league permanently"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}
