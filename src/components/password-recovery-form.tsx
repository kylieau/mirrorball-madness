"use client";

import { useActionState, useState } from "react";
import { requestPasswordReset, resetPassword } from "@/app/forgot-password/actions";
import { INITIAL_AUTH_STATE } from "@/lib/auth-form-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function PasswordRecoveryForm({ reset = false }: { reset?: boolean }) {
  const [state, action, pending] = useActionState(reset ? resetPassword : requestPasswordReset, INITIAL_AUTH_STATE);
  const [email, setEmail] = useState("");
  return <form action={action} className="flex flex-col gap-4">
    {state.error && <p role="alert" className="text-sm text-danger-text">{state.error}</p>}
    {state.notice && <p role="status" className="text-sm text-muted-foreground">{state.notice}</p>}
    {reset ? <>
      <Label htmlFor="password">New Password</Label>
      <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      <Label htmlFor="confirmPassword">Confirm Password</Label>
      <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required />
    </> : <>
      <Label htmlFor="email">Email</Label>
      <Input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
    </>}
    <Button type="submit" disabled={pending}>{pending ? "Updating…" : reset ? "Update Password" : "Send Recovery Link"}</Button>
  </form>;
}
