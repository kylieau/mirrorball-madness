"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  removeMember,
  promoteMember,
  demoteMember,
  generateCoManagerInviteCode,
  removeCoManager,
  unlockGrandFinaleLate,
} from "@/app/leagues/[id]/settings/actions";
import { formatLateFactor, lateEntryLabel, lateUnlockWarning, parseLateFactor } from "@/lib/grand-finale-late";
import { formatManagerName } from "@/lib/manager-display";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type Member = {
  userId: string;
  displayName: string;
  role: string;
  coManagerId: string | null;
  coManagerDisplayName: string | null;
  isOwnRow: boolean;
  inviteCode: string | null;
  hasGrandFinaleBracket: boolean;
  lateUnlock: { lateFactor: number; submitted: boolean } | null;
};

export type LateGrandFinaleControls = {
  canUnlock: boolean;
  resolvedCount: number;
};

function PromoteMemberButton({ leagueId, member }: { leagueId: string; member: Member }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handlePromote() {
    setError(null);
    setSubmitting(true);
    const result = await promoteMember(leagueId, member.userId);
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
    } else {
      router.refresh();
    }
  }

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Promote</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Promote {member.displayName} to commissioner?</DialogTitle>
          <DialogDescription>
            They&apos;ll have full commissioner privileges — league settings, member
            management, and draft controls — same as you.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button onClick={handlePromote} disabled={submitting}>
            {submitting ? "Promoting..." : "Promote to commissioner"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DemoteMemberButton({ leagueId, member }: { leagueId: string; member: Member }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleDemote() {
    setError(null);
    setSubmitting(true);
    const result = await demoteMember(leagueId, member.userId);
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
    } else {
      router.refresh();
    }
  }

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Demote</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Demote {member.displayName} to manager?</DialogTitle>
          <DialogDescription>
            They&apos;ll lose commissioner privileges and go back to a regular manager.
            Blocked if they&apos;re the league&apos;s last remaining commissioner.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button variant="destructive" onClick={handleDemote} disabled={submitting}>
            {submitting ? "Demoting..." : "Demote to manager"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemoveMemberButton({ leagueId, member }: { leagueId: string; member: Member }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleRemove() {
    setError(null);
    setSubmitting(true);
    const result = await removeMember(leagueId, member.userId);
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
    } else {
      router.refresh();
    }
  }

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Remove</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {member.displayName}?</DialogTitle>
          <DialogDescription>
            They&apos;ll lose access to this league. Their historical scores stay on the
            record for the league&apos;s own standings.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button variant="destructive" onClick={handleRemove} disabled={submitting}>
            {submitting ? "Removing..." : "Remove member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InviteCoManagerButton({ leagueId, member }: { leagueId: string; member: Member }) {
  const router = useRouter();
  const [code, setCode] = useState<string | null>(member.inviteCode);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    setError(null);
    setGenerating(true);
    const result = await generateCoManagerInviteCode(leagueId);
    setGenerating(false);
    if (result.error) {
      setError(result.error);
    } else {
      setCode(result.code);
      router.refresh();
    }
  }

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Invite a Co-Manager</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a co-manager</DialogTitle>
          <DialogDescription>
            Share this link with whoever&apos;ll run this team with you — full parity, same
            roster, same picks, same standings.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {code ? (
          <CopyInviteLinkButton
            inviteCode={code}
            basePath="/join/co-manager"
            label="Copy Co-Manager Invite Link"
            size="default"
          />
        ) : (
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? "Generating..." : "Generate Invite Link"}
          </Button>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AllowLateGrandFinaleButton({
  leagueId,
  member,
  resolvedCount,
}: {
  leagueId: string;
  member: Member;
  resolvedCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [factor, setFactor] = useState("1");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const warning = lateUnlockWarning(resolvedCount);
  const parsed = parseLateFactor(factor);
  const canConfirm = parsed !== null && (!warning || acknowledged) && !submitting;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setFactor("1");
      setAcknowledged(false);
      setError(null);
    }
  }

  async function handleUnlock() {
    if (parsed === null) return;
    setError(null);
    setSubmitting(true);
    const result = await unlockGrandFinaleLate(leagueId, member.userId, factor, acknowledged);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        className="text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        Allow Late Grand Finale
      </button>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="px-0">
            <SheetTitle className="font-heading text-xl font-semibold">Allow Late Grand Finale</SheetTitle>
            <SheetDescription className="text-pretty">
              {member.displayName} can submit one Grand Finale bracket after the deadline. It locks again after that save.
            </SheetDescription>
          </SheetHeader>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Late Factor</span>
            <Input
              inputMode="decimal"
              value={factor}
              onChange={(event) => setFactor(event.target.value)}
              aria-invalid={factor.trim() !== "" && parsed === null}
            />
            <span className="text-xs text-muted-foreground">
              1 is full weight. A lower number scales this manager&apos;s Grand Finale points.
            </span>
          </label>
          {factor.trim() !== "" && parsed === null && (
            <p className="text-sm text-destructive">Enter a factor from 0 to 1, with up to two decimals.</p>
          )}
          {warning && (
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
              <p className="text-pretty text-muted-foreground">{warning}</p>
              <label className="mt-3 flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                />
                <span>I understand resolved couples will not be paid.</span>
              </label>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" onClick={handleUnlock} disabled={!canConfirm}>
            {submitting ? "Allowing..." : "Allow Late Grand Finale"}
          </Button>
          <Button
            variant="ghost"
            className="w-full hover:bg-transparent dark:hover:bg-transparent"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
        </SheetContent>
      </Sheet>
    </>
  );
}

function LateGrandFinaleStatus({ member }: { member: Member }) {
  if (!member.lateUnlock) return null;
  const { lateFactor, submitted } = member.lateUnlock;
  const text = submitted
    ? lateEntryLabel(lateFactor)
    : lateFactor < 1
      ? `Late entry open · ${formatLateFactor(lateFactor)}`
      : "Late entry open";
  return <p className="text-xs text-muted-foreground">{text}</p>;
}

function RemoveCoManagerButton({ leagueId, member }: { leagueId: string; member: Member }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleRemove() {
    setError(null);
    setSubmitting(true);
    const result = await removeCoManager(leagueId, member.userId);
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
    } else {
      router.refresh();
    }
  }

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Remove Co-Manager</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {member.coManagerDisplayName}?</DialogTitle>
          <DialogDescription>
            They&apos;ll lose access to this team. {member.displayName} keeps the roster and
            history, and can invite a new co-manager any time.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button variant="destructive" onClick={handleRemove} disabled={submitting}>
            {submitting ? "Removing..." : "Remove co-manager"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LeagueMembersSection({
  leagueId,
  members,
  canEdit,
  lateGrandFinale = null,
}: {
  leagueId: string;
  members: Member[];
  canEdit: boolean;
  lateGrandFinale?: LateGrandFinaleControls | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Members</CardTitle>
        <CardDescription>{members.length} joined</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col">
        {members.map((m) => (
          <div
            key={m.userId}
            className="flex items-center justify-between gap-3 border-t border-border py-2.5 text-sm first:border-t-0"
          >
            <div className="min-w-0">
              <div>
                <span className="font-medium">
                  {formatManagerName({ displayName: m.displayName, coManagerDisplayName: m.coManagerDisplayName })}
                </span>
                <span className="ml-2 capitalize text-muted-foreground">{m.role}</span>
              </div>
              <LateGrandFinaleStatus member={m} />
              {lateGrandFinale?.canUnlock && !m.hasGrandFinaleBracket && !m.lateUnlock && (
                <AllowLateGrandFinaleButton
                  leagueId={leagueId}
                  member={m}
                  resolvedCount={lateGrandFinale.resolvedCount}
                />
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {canEdit &&
                (m.role === "commissioner" ? (
                  <DemoteMemberButton leagueId={leagueId} member={m} />
                ) : (
                  <>
                    <PromoteMemberButton leagueId={leagueId} member={m} />
                    <RemoveMemberButton leagueId={leagueId} member={m} />
                  </>
                ))}
              {m.isOwnRow && !m.coManagerId && <InviteCoManagerButton leagueId={leagueId} member={m} />}
              {(m.isOwnRow || canEdit) && m.coManagerId && (
                <RemoveCoManagerButton leagueId={leagueId} member={m} />
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
