"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestAccountDeletion } from "@/app/settings/account/actions";
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

export function RequestDeletionButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleRequest() {
    setError(null);
    setSubmitting(true);
    const result = await requestAccountDeletion();
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
    } else {
      router.refresh();
    }
  }

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="destructive" className="self-start" />}>
        Delete My Account
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription>
            This submits a deletion request — it&apos;s reviewed and processed by hand rather
            than instantly, since your historical scores are woven into other members&apos;
            league standings and can&apos;t be safely erased automatically. You can cancel the
            request any time before it&apos;s processed.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button variant="destructive" onClick={handleRequest} disabled={submitting}>
            {submitting ? "Requesting..." : "Request deletion"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
