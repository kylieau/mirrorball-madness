"use client";

import { useState } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EXCEPTION_LABEL,
  exceptionStatus,
  roundTabLabel,
  type EpisodeRound,
  type ExceptionKind,
} from "@/lib/episode-rounds";

export type ExceptionChoice = { kind: ExceptionKind; roundIds: string[]; note: string | null; bonusPoints: number | null };

// Mark an Exception, inline in a couple's card or a round's Not in This Round
// band: a reason, which rounds it covers, an optional note, and what it does
// said before it is saved. Immune is for special rounds (it skips their
// heats); Withdrawn is always the whole night.
export function RoundExceptionPanel({
  coupleName,
  rounds,
  round,
  saving,
  error,
  onSave,
  onCancel,
}: {
  coupleName: string;
  rounds: EpisodeRound[];
  // The round the panel was opened from.
  round: EpisodeRound;
  saving: boolean;
  error: string | null;
  onSave: (choice: ExceptionChoice) => void;
  onCancel: () => void;
}) {
  const specialRounds = rounds.filter((r) => r.kind === "special");
  const kinds: ExceptionKind[] = specialRounds.length > 0 ? ["immune", "not_dancing", "withdrawn"] : ["not_dancing", "withdrawn"];
  const [kind, setKind] = useState<ExceptionKind>(round.kind === "special" ? "immune" : "not_dancing");
  const [wholeNight, setWholeNight] = useState(false);
  const [note, setNote] = useState("");
  const [bonus, setBonus] = useState("");

  const immuneRounds = round.kind === "special" ? [round] : specialRounds;
  const roundIds =
    kind === "withdrawn"
      ? rounds.map((r) => r.id)
      : kind === "immune"
        ? immuneRounds.map((r) => r.id)
        : wholeNight
          ? rounds.map((r) => r.id)
          : [round.id];
  const bonusValue = bonus.trim() === "" ? null : Number(bonus);
  const bonusInvalid =
    bonusValue != null && (Number.isNaN(bonusValue) || bonusValue * 2 !== Math.trunc(bonusValue * 2) || Math.abs(bonusValue) > 100);
  const roundBonus = immuneRounds.find((r) => r.bonusPoints != null)?.bonusPoints ?? null;
  const status = exceptionStatus({
    kind,
    coupleName,
    roundNames: rounds.filter((r) => roundIds.includes(r.id)).map((r) => roundTabLabel(r)),
    wholeNight: kind === "withdrawn" || roundIds.length === rounds.length,
    bonus: kind === "immune" ? (bonusValue ?? roundBonus) : null,
  });

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-ring bg-accent/5 p-2.5 ring-3 ring-ring/30">
      <p className="text-[13px] font-semibold">Mark {coupleName}</p>
      <div className="flex flex-wrap gap-1.5">
        {kinds.map((k) => (
          <Button key={k} type="button" variant={kind === k ? "default" : "outline"} className="rounded-full" onClick={() => setKind(k)}>
            {EXCEPTION_LABEL[k]}
          </Button>
        ))}
      </div>
      {kind === "not_dancing" && rounds.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">Applies To</span>
          <div className="grid grid-flow-col auto-cols-fr gap-1 rounded-lg bg-muted/60 p-1">
            {[false, true].map((all) => (
              <button
                key={String(all)}
                type="button"
                className={cn("min-h-11 rounded-md px-2 text-[13px] font-medium", wholeNight === all ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground")}
                onClick={() => setWholeNight(all)}
              >
                {all ? "Every Round Tonight" : `Round ${round.position} Only`}
              </button>
            ))}
          </div>
        </div>
      )}
      {kind === "immune" && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">Their Bonus (pts)</span>
          <Input
            inputMode="decimal"
            aria-label="Their bonus"
            className={cn("w-20 text-center", bonusInvalid && "border-destructive")}
            placeholder={roundBonus != null ? String(roundBonus) : "Round's"}
            value={bonus}
            onChange={(e) => setBonus(e.target.value)}
          />
          <span className="text-xs text-muted-foreground">Blank follows the winner&apos;s bonus</span>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium">
          Note <span className="font-normal text-muted-foreground">(Optional)</span>
        </span>
        <Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
      </div>
      <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-snug text-amber-text">{status}</p>
      {error && (
        <p role="alert" className="text-xs text-danger-text">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={saving || bonusInvalid || roundIds.length === 0}
          onClick={() => onSave({ kind, roundIds, note: note.trim() || null, bonusPoints: kind === "immune" ? bonusValue : null })}
        >
          {saving ? "Saving…" : "Save Exception"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
