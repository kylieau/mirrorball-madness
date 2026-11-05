"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  EXCEPTION_LABEL,
  exceptionStatus,
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
  const id = useId();
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
    roundNames: rounds.filter((r) => roundIds.includes(r.id)).map((r) => `Round ${r.position}`),
    wholeNight: kind === "withdrawn" || roundIds.length === rounds.length,
    bonus: kind === "immune" ? (bonusValue ?? roundBonus) : null,
  });

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-ring bg-accent/5 p-3">
      <p className="text-sm font-semibold">Mark {coupleName}</p>
      <div role="group" aria-labelledby={`${id}-reason`} className="flex flex-col gap-2">
        <Label id={`${id}-reason`}>Reason</Label>
        <div className="flex flex-wrap gap-2">
          {kinds.map((k) => (
            <Button key={k} type="button" size="sm" variant={kind === k ? "default" : "outline"} aria-pressed={kind === k} onClick={() => setKind(k)}>
              {EXCEPTION_LABEL[k]}
            </Button>
          ))}
        </div>
      </div>
      {kind === "not_dancing" && rounds.length > 1 && (
        <div role="group" aria-labelledby={`${id}-applies`} className="flex flex-col gap-2">
          <Label id={`${id}-applies`}>Applies To</Label>
          <div className="flex flex-wrap gap-2">
            {[false, true].map((all) => (
              <Button
                key={String(all)}
                type="button"
                size="sm"
                variant={wholeNight === all ? "default" : "outline"}
                aria-pressed={wholeNight === all}
                onClick={() => setWholeNight(all)}
              >
                {all ? "Every Round Tonight" : `Round ${round.position} Only`}
              </Button>
            ))}
          </div>
        </div>
      )}
      {kind === "immune" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-bonus`}>Their Bonus</Label>
          <div className="flex items-center gap-2">
            <Input
              id={`${id}-bonus`}
              inputMode="decimal"
              className="h-8 w-20 text-center text-xs"
              placeholder={roundBonus != null ? String(roundBonus) : "—"}
              aria-invalid={bonusInvalid}
              value={bonus}
              onChange={(e) => setBonus(e.target.value)}
            />
            <span className="text-sm text-muted-foreground">pts</span>
          </div>
          {bonusInvalid ? (
            <p role="alert" className="text-xs text-danger-text">
              Use −100 to 100, in steps of 0.5.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Blank follows the round&apos;s winner&apos;s bonus.</p>
          )}
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-note`}>Note (Optional)</Label>
        <Input id={`${id}-note`} className="h-8 text-xs" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
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
