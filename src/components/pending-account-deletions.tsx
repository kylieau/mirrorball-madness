"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearPendingAccountDeletion } from "@/app/admin/accounts/actions";
import type { PendingAccountDeletion } from "@/lib/account-deletions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

function RequestedAt({ iso }: { iso: string }) {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    setLabel(
      new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    );
  }, [iso]);
  return <span>{label ?? "\u00a0"}</span>;
}

function ClearRequestButton({
  request,
  onCleared,
}: {
  request: PendingAccountDeletion;
  onCleared: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleClear() {
    setError(null);
    setSubmitting(true);
    const result = await clearPendingAccountDeletion(request.id);
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setOpen(false);
    onCleared();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        Clear Request
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clear this deletion request?</DialogTitle>
          <DialogDescription>
            {request.displayName}&apos;s account stays. This only removes them
            from the queue — they can request deletion again from Settings.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button onClick={handleClear} disabled={submitting}>
            {submitting ? "Clearing..." : "Clear Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PendingAccountDeletions({
  requests,
}: {
  requests: PendingAccountDeletion[];
}) {
  const router = useRouter();

  if (requests.length === 0) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">No pending deletion requests.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {requests.map((request) => (
        <Card key={request.id}>
          <CardHeader>
            <CardTitle>{request.displayName}</CardTitle>
            <CardDescription>{request.email ?? "No email on file"}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Requested <RequestedAt iso={request.deletionRequestedAt} />
            </p>
            <p className="font-mono text-xs break-all text-muted-foreground">{request.id}</p>
            <ClearRequestButton request={request} onCleared={() => router.refresh()} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
