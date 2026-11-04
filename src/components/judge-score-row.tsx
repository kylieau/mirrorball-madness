"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { markInputError } from "@/lib/judge-marks";
import { MARK_MAX } from "@/lib/scoring";

export type ScoreRowJudge = { id: string; name: string; guest: boolean };

// One dance's judge boxes on Enter Results, the same for a couple's own dance
// and a special dance. A guest is named as one in words, not colour alone.
export function JudgeScoreRow({
  judges,
  values,
  subject,
  disabled,
  onChange,
}: {
  judges: ScoreRowJudge[];
  values: Record<string, string>;
  // Who is being scored, for each box's accessible name.
  subject: string;
  disabled?: boolean;
  onChange: (judgeId: string, value: string) => void;
}) {
  const total = judges.reduce((sum, j) => {
    const raw = (values[j.id] ?? "").trim();
    return raw !== "" && markInputError(raw) == null ? sum + Number(raw) : sum;
  }, 0);
  return (
    <div className="grid grid-cols-2 gap-2 min-[420px]:flex min-[420px]:flex-wrap min-[420px]:items-end">
      {judges.map((j) => {
        const fieldError = markInputError(values[j.id] ?? "");
        return (
          <div key={j.id} className="flex min-w-0 flex-col gap-1 min-[420px]:min-w-28">
            <Label className="text-xs text-muted-foreground">
              {j.name}
              {j.guest && <span className="text-accent"> · Guest</span>}
            </Label>
            <Input
              inputMode="numeric"
              aria-label={`${j.name} score for ${subject}`}
              aria-invalid={fieldError != null}
              className={`h-11 w-full min-w-14 px-2 text-center text-sm min-[420px]:w-16 ${fieldError ? "border-destructive" : ""}`}
              placeholder="—"
              value={values[j.id] ?? ""}
              disabled={disabled}
              onChange={(e) => onChange(j.id, e.target.value)}
            />
            {fieldError && (
              <p role="alert" className="text-xs leading-snug text-danger-text">
                {fieldError}
              </p>
            )}
          </div>
        );
      })}
      <div className="col-span-2 flex flex-col gap-1 min-[420px]:col-span-1">
        <Label className="text-xs text-muted-foreground">Total</Label>
        <p className="flex h-11 items-center px-1 text-base font-medium">
          {total}
          <span className="ml-0.5 text-sm font-normal text-muted-foreground">/{judges.length * MARK_MAX}</span>
        </p>
      </div>
    </div>
  );
}
