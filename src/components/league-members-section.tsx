"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  removeMember,
  promoteMember,
  demoteMember,
  generateCoManagerInviteCode,
  removeCoManager,
} from "@/app/leagues/[id]/settings/actions";
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

type Member = {
  userId: string;
  displayName: string;
  role: string;
  coManagerId: string | null;
  coManagerDisplayName: string | null;
  isOwnRow: boolean;
  inviteCode: string | null;
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
}: {
  leagueId: string;
  members: Member[];
  canEdit: boolean;
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
            <div>
              <span className="font-medium">
                {formatManagerName({ displayName: m.displayName, coManagerDisplayName: m.coManagerDisplayName })}
              </span>
              <span className="ml-2 capitalize text-muted-foreground">{m.role}</span>
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
