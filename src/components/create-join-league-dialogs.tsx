"use client";

import { cn } from "cn";
import { createLeague, joinWithCode } from "@/app/leagues/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";
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

// prominent: full-size buttons for a viewer with no league yet, where these
// are the only actions on the page.
export function CreateJoinLeagueDialogs({
  stacked = false,
  quiet = false,
  prominent = false,
}: {
  stacked?: boolean;
  quiet?: boolean;
  prominent?: boolean;
}) {
  const size = prominent ? "lg" : "xs";
  return (
    <div
      className={
        quiet
          ? "flex items-center gap-2"
          : stacked || prominent
            ? cn("flex flex-col items-stretch", prominent ? "gap-3" : "gap-1.5")
            : "flex gap-2"
      }
    >
      <Dialog>
        <DialogTrigger render={<Button size={size} variant="default" />}>
          {quiet ? "Create a League" : "+ Create a League"}
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
              <Input id="name" name="name" autoComplete="off" required />
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
              <SubmitButton idleLabel="Create League" pendingLabel="Creating…" />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog>
        <DialogTrigger render={<Button variant="outline" size={size} />}>
          {quiet ? "Join a League" : "Join with Code"}
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
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                className="uppercase"
                required
              />
            </div>
            <DialogFooter>
              <SubmitButton idleLabel="Join League" pendingLabel="Joining…" />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
