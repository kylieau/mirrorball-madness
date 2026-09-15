"use client";

import { useState, type FormEvent } from "react";
import { updateProfile } from "@/app/settings/profile/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Shared between the Profile dialog (AccountSettingsSheet) and the
// /settings/profile fallback page — same form, no Card wrapper of its own
// so each host can chrome it however fits (a page wraps it in a Card, a
// Dialog just renders it directly).
export function ProfileForm({ displayName }: { displayName: string }) {
  const [name, setName] = useState(displayName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSubmitting(true);
    const result = await updateProfile(name);
    if (result.error) setError(result.error);
    else setSaved(true);
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && <p className="text-sm text-muted-foreground">Saved.</p>}
      <div className="flex flex-col gap-2">
        <Label htmlFor="displayName">Display Name</Label>
        <Input id="displayName" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <Button type="submit" className="self-start" disabled={submitting}>
        {submitting ? "Saving..." : "Save"}
      </Button>
    </form>
  );
}
