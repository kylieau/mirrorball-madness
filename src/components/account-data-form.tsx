"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { updateEmail, updatePassword, cancelAccountDeletion } from "@/app/settings/account/actions";
import { RequestDeletionButton } from "@/components/request-deletion-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function EmailForm({ currentEmail }: { currentEmail: string }) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSent(false);
    setSubmitting(true);
    const result = await updateEmail(email);
    if (result.error) setError(result.error);
    else setSent(true);
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Currently {currentEmail}</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {sent && <p className="text-sm text-muted-foreground">Check your new email to confirm the change.</p>}
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">New Email</Label>
        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <Button type="submit" className="self-start" disabled={submitting}>
        {submitting ? "Updating..." : "Update email"}
      </Button>
    </form>
  );
}

function PasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSubmitting(true);
    const result = await updatePassword(password, confirmPassword);
    if (result.error) {
      setError(result.error);
    } else {
      setSaved(true);
      setPassword("");
      setConfirmPassword("");
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && <p className="text-sm text-muted-foreground">Password updated.</p>}
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">New Password</Label>
        <Input
          id="password"
          type="password"
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmPassword">Confirm New Password</Label>
        <Input
          id="confirmPassword"
          type="password"
          minLength={6}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
      </div>
      <Button type="submit" className="self-start" disabled={submitting}>
        {submitting ? "Updating..." : "Update password"}
      </Button>
    </form>
  );
}

function DangerZone({ deletionRequestedAt }: { deletionRequestedAt: string | null }) {
  const router = useRouter();
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    setError(null);
    setCanceling(true);
    const result = await cancelAccountDeletion();
    if (result.error) {
      setError(result.error);
      setCanceling(false);
    } else {
      router.refresh();
    }
  }

  if (deletionRequestedAt) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Deletion requested on {new Date(deletionRequestedAt).toLocaleDateString()}. It hasn&apos;t been
          processed yet — you can still cancel.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button variant="outline" onClick={handleCancel} disabled={canceling} className="self-start">
          {canceling ? "Canceling..." : "Cancel deletion request"}
        </Button>
      </div>
    );
  }

  return <RequestDeletionButton />;
}

// Shared between the Account & data dialog (AccountSettingsSheet) and the
// /settings/account fallback page.
export function AccountDataForm({
  email,
  deletionRequestedAt,
}: {
  email: string;
  deletionRequestedAt: string | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="mb-2 text-sm font-semibold">Email</h3>
        <EmailForm currentEmail={email} />
      </div>
      <div className="border-t border-border pt-4">
        <h3 className="mb-2 text-sm font-semibold">Password</h3>
        <PasswordForm />
      </div>
      <div className="border-t border-border pt-4">
        <p className="mb-2 text-sm font-semibold text-destructive">Danger Zone</p>
        <DangerZone deletionRequestedAt={deletionRequestedAt} />
      </div>
    </div>
  );
}
