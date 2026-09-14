"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { removeMember, promoteMember, demoteMember } from "@/app/leagues/[id]/settings/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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

type Member = { userId: string; displayName: string; role: string };

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
              <span className="font-medium">{m.displayName}</span>
              <span className="ml-2 capitalize text-muted-foreground">{m.role}</span>
            </div>
            {canEdit && (
              <div className="flex gap-2">
                {m.role === "commissioner" ? (
                  <DemoteMemberButton leagueId={leagueId} member={m} />
                ) : (
                  <>
                    <PromoteMemberButton leagueId={leagueId} member={m} />
                    <RemoveMemberButton leagueId={leagueId} member={m} />
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
