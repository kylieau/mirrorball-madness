"use client";

import { useFormStatus } from "react-dom";
import { createLeague, joinWithCode } from "@/app/leagues/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SCORING_MODULES } from "@/lib/scoring-modules";

function SubmitButton({ idleLabel, pendingLabel }: { idleLabel: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? pendingLabel : idleLabel}
    </Button>
  );
}

export function CreateJoinLeagueDialogs({ quiet = false }: { quiet?: boolean }) {
  return (
    <div className="flex gap-2">
      <Dialog>
        <DialogTrigger render={<Button variant={quiet ? "ghost" : "default"} size={quiet ? "sm" : "default"} />}>
          + Create a League
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a League</DialogTitle>
            <DialogDescription>
              You&apos;ll be the commissioner and get an invite code to share.
            </DialogDescription>
          </DialogHeader>
          <form action={createLeague} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">League Name</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Scoring Modules</Label>
              <div className="flex flex-col">
                {SCORING_MODULES.map((m) => (
                  <label
                    key={m.key}
                    className="grid grid-cols-[1fr_1fr] items-center gap-4 border-b border-border py-2 text-sm last:border-b-0"
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <input type="checkbox" name={m.createField} defaultChecked />
                      {m.name}
                    </span>
                    <span className="text-muted-foreground">{m.description}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Weights and Grand Finale scoring details can be fine-tuned later in League Settings.
              </p>
            </div>
            <DialogFooter>
              <SubmitButton idleLabel="Create league" pendingLabel="Creating..." />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog>
        <DialogTrigger render={<Button variant={quiet ? "ghost" : "outline"} size={quiet ? "sm" : "default"} />}>
          Join with Code
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Join a League</DialogTitle>
            <DialogDescription>
              Enter the 6-character code you were given — a regular league invite or a
              co-manager invite both work here.
            </DialogDescription>
          </DialogHeader>
          <form action={joinWithCode} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="inviteCode">Invite Code</Label>
              <Input
                id="inviteCode"
                name="inviteCode"
                maxLength={6}
                className="uppercase"
                required
              />
            </div>
            <DialogFooter>
              <SubmitButton idleLabel="Join League" pendingLabel="Joining..." />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
