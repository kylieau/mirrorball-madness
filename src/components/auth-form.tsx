"use client";

import { useActionState, useState } from "react";
import { signIn, signUp } from "@/app/auth/actions";
import { INITIAL_AUTH_STATE } from "@/lib/auth-form-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function AuthForm({ mode, next }: { mode: "sign-in" | "sign-up"; next?: string }) {
  const signingUp = mode === "sign-up";
  const [state, action, pending] = useActionState(signingUp ? signUp : signIn, INITIAL_AUTH_STATE);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  return <form action={action} className="flex flex-col gap-4">
    {next && <input type="hidden" name="next" value={next} />}
    {state.error && <p role="alert" className="text-sm text-danger-text">{state.error}</p>}
    {state.notice && <p role="status" className="text-sm text-muted-foreground">{state.notice}</p>}
    {signingUp && <div className="flex flex-col gap-2">
      <Label htmlFor="displayName">Display Name</Label>
      <Input id="displayName" name="displayName" autoComplete="nickname" required maxLength={80}
        value={name} onChange={(event) => setName(event.target.value)} />
    </div>}
    <div className="flex flex-col gap-2">
      <Label htmlFor="email">Email</Label>
      <Input id="email" name="email" type="email" autoComplete="email" spellCheck={false} required
        value={email} onChange={(event) => setEmail(event.target.value)} />
    </div>
    <div className="flex flex-col gap-2">
      <Label htmlFor="password">Password</Label>
      <Input id="password" name="password" type="password" required minLength={signingUp ? 8 : undefined}
        autoComplete={signingUp ? "new-password" : "current-password"} />
    </div>
    <Button type="submit" disabled={pending}>{pending ? signingUp ? "Creating…" : "Signing In…" : signingUp ? "Create Account" : "Sign In"}</Button>
  </form>;
}
