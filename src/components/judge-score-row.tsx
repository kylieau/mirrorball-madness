"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { JUDGE_MARK_MESSAGE, markInputError } from "@/lib/judge-marks";
import { MARK_MAX } from "@/lib/scoring";

export type ScoreRowJudge = { id: string; name: string };

// Roughly a character's width in em at this font, for sizing names to fit.
const CHAR_EM = 0.6;

// One dance's judge boxes on Enter Results, the same for a couple's own dance
// and a special dance: every judge and the total on one line. Names shrink
// together to fit their column on one line (sized from the longest), and an
// invalid box is outlined with the rule stated once under the row, since a
// box is too narrow for it.
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
  const invalid = judges.some((j) => markInputError(values[j.id] ?? "") != null);
  const longest = Math.max("Total".length, ...judges.map((j) => j.name.length));
  // cqi is the column's own width (each column is a size container).
  const labelStyle = { fontSize: `min(0.75rem, ${(100 / (longest * CHAR_EM)).toFixed(2)}cqi)` };
  const labelClass = "block overflow-hidden whitespace-nowrap leading-tight text-muted-foreground";
  return (
    <div className="flex flex-col gap-1">
      <div className="grid auto-cols-[minmax(0,1fr)] grid-flow-col gap-1.5">
        {judges.map((j) => {
          const fieldError = markInputError(values[j.id] ?? "") != null;
          return (
            <div key={j.id} className="@container flex min-w-0 flex-col justify-end gap-1">
              <Label className={labelClass} style={labelStyle}>
                {j.name}
              </Label>
              <Input
                inputMode="numeric"
                aria-label={`${j.name} score for ${subject}`}
                aria-invalid={fieldError}
                className={`h-11 w-full min-w-0 px-1 text-center text-sm ${fieldError ? "border-destructive" : ""}`}
                placeholder="—"
                value={values[j.id] ?? ""}
                disabled={disabled}
                onChange={(e) => onChange(j.id, e.target.value)}
              />
            </div>
          );
        })}
        <div className="@container flex min-w-0 flex-col justify-end gap-1">
          <Label className={labelClass} style={labelStyle}>
            Total
          </Label>
          <p className="flex h-11 items-center justify-center whitespace-nowrap text-base font-medium">
            {total}
            <span className="text-sm font-normal text-muted-foreground">/{judges.length * MARK_MAX}</span>
          </p>
        </div>
      </div>
      {invalid && (
        <p role="alert" className="text-xs leading-snug text-danger-text">
          {JUDGE_MARK_MESSAGE}
        </p>
      )}
    </div>
  );
}
