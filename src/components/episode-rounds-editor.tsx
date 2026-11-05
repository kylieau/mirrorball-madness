"use client";

import { useId, useState } from "react";
import { LockIcon, MinusIcon, PlusIcon, SearchIcon, Trash2Icon, XIcon } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  draftsWithException,
  ELIMINATION_ROUND_OPTIONS,
  EXCEPTION_LABEL,
  heatName,
  MAX_ROUNDS,
  MAX_UNITS,
  newRoundDraft,
  OWN_ROUND_OPTIONS,
  pairingChecks,
  resizeUnits,
  SPECIAL_ROUND_OPTIONS,
  SPECIAL_SCORING_OPTIONS,
  unitNoun,
  type ExceptionKind,
  type PairingCheck,
  type RoundDraft,
  type RoundOption,
} from "@/lib/episode-rounds";

type Couple = { id: string; name: string };

const NO_COUPLE = "none";
const BONUS_MESSAGE = "Use −100 to 100, in steps of 0.5.";
const KIND_BADGE: Record<RoundDraft["kind"], string> = { own: "Every Couple", special: "Special", none: "Elimination Only" };
const CHECK_TONE: Record<PairingCheck["tone"], string> = {
  danger: "border-destructive/50 bg-destructive/10 text-danger-text",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-text",
  muted: "border-border bg-muted/40 text-muted-foreground",
  ok: "border-emerald/40 bg-emerald/10 text-emerald-text",
};
const MICRO_LABEL = "px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";

function isHeadToHead(draft: Pick<RoundDraft, "roundType" | "scoring">): boolean {
  return /dance-?off/i.test(draft.roundType) && draft.scoring !== "ranked_points";
}

function parseBonus(raw: string): { value: number | null; invalid: boolean } {
  const trimmed = raw.trim();
  if (trimmed === "") return { value: null, invalid: false };
  const value = Number(trimmed);
  return { value, invalid: Number.isNaN(value) || Math.abs(value) > 100 || value * 2 !== Math.trunc(value * 2) };
}

// Edit Episode → Dance Rounds For This Episode. Round 1 (the Individual
// Dance) is always on; rounds are added from a picker that also takes a typed
// name. Nothing here saves on its own: the sheet's Save sends the plan.
export function EpisodeRoundsEditor({
  drafts,
  onChange,
  couples,
  published,
}: {
  drafts: RoundDraft[];
  onChange: (drafts: RoundDraft[]) => void;
  // The night's cast, for pairings and exceptions.
  couples: Couple[];
  // A published week's exceptions change in a correction on Enter Results.
  published: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const [marking, setMarking] = useState<string | null>(null);
  const nameOf = (id: string) => couples.find((c) => c.id === id)?.name ?? "A couple";

  function patch(key: string, change: (d: RoundDraft) => RoundDraft) {
    onChange(drafts.map((d) => (d.key === key ? change(d) : d)));
  }

  function addRound(option: RoundOption) {
    onChange([...drafts, newRoundDraft(option, `new-${Date.now()}`)]);
    setPicking(false);
    setSearch("");
  }

  const typed = search.trim();
  const matches = (o: RoundOption) => !typed || o.roundType.toLowerCase().includes(typed.toLowerCase());
  const known = [...OWN_ROUND_OPTIONS, ...SPECIAL_ROUND_OPTIONS, ...ELIMINATION_ROUND_OPTIONS].some(
    (o) => o.roundType.toLowerCase() === typed.toLowerCase()
  );

  function optionRow(option: RoundOption) {
    return (
      <Button
        key={`${option.kind}-${option.roundType}`}
        type="button"
        variant="ghost"
        className="h-auto w-full flex-col items-start gap-0 py-1.5 text-left whitespace-normal"
        onClick={() => addRound(option)}
      >
        <span className="text-sm font-semibold">{option.roundType}</span>
        <span className="text-xs font-normal text-muted-foreground">{option.description}</span>
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Dance Rounds For This Episode</Label>
      <p className="text-xs text-muted-foreground">
        Every couple is expected in every round. Mark anyone who isn&apos;t (Immune, Not Dancing, or Withdrawn) so their slot is
        accounted for, not missing.
      </p>
      {drafts.map((draft, index) => (
        <RoundCard
          key={draft.key}
          draft={draft}
          position={index + 1}
          couples={couples}
          nameOf={nameOf}
          published={published}
          removing={removing === draft.key}
          marking={marking === draft.key}
          onPatch={(change) => patch(draft.key, change)}
          onAskRemove={() => setRemoving(draft.key)}
          onCancelRemove={() => setRemoving(null)}
          onRemove={() => {
            onChange(drafts.filter((d) => d.key !== draft.key));
            setRemoving(null);
          }}
          onMarking={(open) => setMarking(open ? draft.key : null)}
          onException={(coupleId, exception) => {
            onChange(draftsWithException(drafts, draft.key, coupleId, exception));
            setMarking(null);
          }}
        />
      ))}
      {drafts.length < MAX_ROUNDS && (
        <Button
          type="button"
          variant="outline"
          className="w-full border-dashed border-primary/60 text-accent"
          aria-expanded={picking}
          onClick={() => setPicking((open) => !open)}
        >
          <PlusIcon className="size-4" />
          Add Round
        </Button>
      )}
      {picking && (
        <div className="rounded-lg bg-popover p-1 shadow-md ring-1 ring-foreground/10">
          <div className="flex items-center gap-2 border-b border-border px-2">
            <SearchIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <Input
              autoFocus
              aria-label="Search or type a round"
              className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
              placeholder="Search or Type a Round"
              value={search}
              maxLength={40}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {typed && !known && (
            <>
              <p className={MICRO_LABEL}>Add &ldquo;{typed}&rdquo;</p>
              {optionRow({ roundType: typed, kind: "own", description: "Every couple dances their own", scoring: "marks", unitCount: 0 })}
              {optionRow({ roundType: typed, kind: "special", description: "A special dance in heats or groups", scoring: "fixed_bonus", unitCount: 1 })}
            </>
          )}
          {OWN_ROUND_OPTIONS.some(matches) && <p className={MICRO_LABEL}>Every couple dances their own</p>}
          {OWN_ROUND_OPTIONS.filter(matches).map(optionRow)}
          {SPECIAL_ROUND_OPTIONS.some(matches) && <p className={MICRO_LABEL}>Special dances · groups and heats</p>}
          {SPECIAL_ROUND_OPTIONS.filter(matches).map(optionRow)}
          {ELIMINATION_ROUND_OPTIONS.some(matches) && <p className={MICRO_LABEL}>No points · elimination only</p>}
          {ELIMINATION_ROUND_OPTIONS.filter(matches).map(optionRow)}
        </div>
      )}
    </div>
  );
}

function RoundCard({
  draft,
  position,
  couples,
  nameOf,
  published,
  removing,
  marking,
  onPatch,
  onAskRemove,
  onCancelRemove,
  onRemove,
  onMarking,
  onException,
}: {
  draft: RoundDraft;
  position: number;
  couples: Couple[];
  nameOf: (id: string) => string;
  published: boolean;
  removing: boolean;
  marking: boolean;
  onPatch: (change: (d: RoundDraft) => RoundDraft) => void;
  onAskRemove: () => void;
  onCancelRemove: () => void;
  onRemove: () => void;
  onMarking: (open: boolean) => void;
  onException: (coupleId: string, exception: { kind: ExceptionKind; note: string | null; bonusPoints: number | null } | null) => void;
}) {
  const id = useId();
  const locked = position === 1;
  const special = draft.kind === "special";
  const noun = unitNoun(draft);
  const singular = unitNoun(draft, false).toLowerCase();
  const [bonusText, setBonusText] = useState(draft.bonusPoints != null ? String(draft.bonusPoints) : "");
  const bonus = parseBonus(bonusText);
  const checks =
    special && draft.units
      ? pairingChecks({ round: draft, units: draft.units, exceptions: draft.exceptions, castIds: couples.map((c) => c.id), name: nameOf })
      : [];

  return (
    <div className={cn("flex flex-col gap-4 rounded-xl border px-4 py-3", special ? "border-primary/50 bg-primary/[0.04]" : "border-border bg-card/60")}>
      <div className="flex items-center gap-2">
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary font-heading text-sm font-semibold text-primary-foreground">
          {position}
        </span>
        <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-heading text-base font-semibold">{draft.roundType || "New Round"}</span>
          <Badge variant="secondary">{KIND_BADGE[draft.kind]}</Badge>
        </p>
        {locked ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <LockIcon aria-hidden className="size-3.5" />
            Always On
          </span>
        ) : (
          <Button type="button" size="icon" variant="ghost" className="text-danger-text" aria-label={`Remove Round ${position}`} onClick={onAskRemove}>
            <Trash2Icon className="size-4" />
          </Button>
        )}
      </div>

      {removing && (
        <div className="flex flex-col gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <p className="text-sm">
            Remove Round {position}
            {special ? ` and its ${draft.unitCount} ${draft.unitCount === 1 ? singular : noun.toLowerCase()}` : ""}?
            {draft.exceptions.length > 0 ? " Its exceptions go with it." : ""}
          </p>
          {special && <p className="text-xs text-muted-foreground">A {singular} that already has scores stops the save; clear it on Enter Results first.</p>}
          <div className="flex gap-2">
            <Button type="button" variant="destructive" onClick={onRemove}>
              Remove Round
            </Button>
            <Button type="button" variant="outline" onClick={onCancelRemove}>
              Keep It
            </Button>
          </div>
        </div>
      )}

      {locked ? (
        <p className="text-xs text-muted-foreground">Every couple dances their own. Style and song are typed on Enter Results, and save as you type.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-name`}>Round Name</Label>
          <Input id={`${id}-name`} value={draft.roundType} maxLength={40} onChange={(e) => onPatch((d) => ({ ...d, roundType: e.target.value }))} />
          {draft.kind === "own" && <p className="text-xs text-muted-foreground">Adds a dance to every couple on Enter Results. Style and song are typed there.</p>}
          {draft.kind === "none" && <p className="text-xs text-muted-foreground">Decides the elimination only. Nothing is scored.</p>}
        </div>
      )}

      {special && (
        <>
          <div role="group" aria-labelledby={`${id}-scoring`} className="flex flex-col gap-2">
            <Label id={`${id}-scoring`}>Scoring</Label>
            <div className="flex flex-wrap gap-2">
              {SPECIAL_SCORING_OPTIONS.map((option) => (
                <Button
                  key={option.scoring}
                  type="button"
                  size="sm"
                  variant={draft.scoring === option.scoring ? "default" : "outline"}
                  aria-pressed={draft.scoring === option.scoring}
                  onClick={() =>
                    onPatch((d) => ({
                      ...d,
                      scoring: option.scoring,
                      units: option.scoring === "team_marks" ? null : (d.units ?? Array.from({ length: d.unitCount }, () => [])),
                    }))
                  }
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{SPECIAL_SCORING_OPTIONS.find((o) => o.scoring === draft.scoring)?.help}</p>
          </div>

          {draft.scoring === "fixed_bonus" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-bonus`}>Winner&apos;s Bonus</Label>
              <div className="flex items-center gap-2">
                <Input
                  id={`${id}-bonus`}
                  inputMode="decimal"
                  className="w-20 text-center"
                  placeholder="—"
                  aria-invalid={bonus.invalid}
                  aria-describedby={`${id}-bonus-help`}
                  value={bonusText}
                  onChange={(e) => {
                    setBonusText(e.target.value);
                    const next = parseBonus(e.target.value);
                    if (!next.invalid) onPatch((d) => ({ ...d, bonusPoints: next.value }));
                  }}
                />
                <span className="text-sm text-muted-foreground">pts</span>
              </div>
              {bonus.invalid ? (
                <p id={`${id}-bonus-help`} role="alert" className="text-xs text-danger-text">
                  {BONUS_MESSAGE}
                </p>
              ) : (
                <p id={`${id}-bonus-help`} className="text-xs text-muted-foreground">
                  Optional. Can be set on the night, once the show announces it.
                </p>
              )}
            </div>
          )}

          <div role="group" aria-labelledby={`${id}-units`} className="flex flex-col gap-2">
            <Label id={`${id}-units`}>{noun}</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label={`Fewer ${noun.toLowerCase()}`}
                disabled={draft.unitCount <= 1}
                onClick={() => onPatch((d) => resizeUnits(d, d.unitCount - 1))}
              >
                <MinusIcon className="size-4" />
              </Button>
              <span aria-live="polite" className="inline-flex h-8 w-10 items-center justify-center rounded-lg border border-input text-sm font-semibold">
                {draft.unitCount}
              </span>
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label={`More ${noun.toLowerCase()}`}
                disabled={draft.unitCount >= MAX_UNITS}
                onClick={() => onPatch((d) => resizeUnits(d, d.unitCount + 1))}
              >
                <PlusIcon className="size-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {draft.units
                ? draft.unitCount > 1
                  ? `Named ${heatName(draft.roundType, 1, draft.unitCount)} to ${heatName(draft.roundType, draft.unitCount, draft.unitCount)} on Enter Results.`
                  : `Named ${draft.roundType.trim() || "after the round"} on Enter Results.`
                : "Team names and members are set in each team's panel on Enter Results."}
            </p>
          </div>

          {draft.units && (
            <div className="flex flex-col gap-2">
              <Label>{isHeadToHead(draft) ? "Pairings" : "Participants"}</Label>
              <p className="-mt-1 text-xs text-muted-foreground">Optional. Can be set on the night, when they&apos;re announced.</p>
              {draft.units.map((unit, i) => (
                <UnitMembers
                  key={i}
                  label={heatName(draft.roundType, i + 1, draft.unitCount)}
                  members={unit}
                  couples={couples.filter((c) => !draft.exceptions.some((x) => x.coupleId === c.id))}
                  headToHead={isHeadToHead(draft)}
                  onChange={(members) => onPatch((d) => ({ ...d, units: d.units!.map((u, j) => (j === i ? members : u)) }))}
                />
              ))}
            </div>
          )}
        </>
      )}

      {draft.kind !== "none" && (
        <div className="flex flex-col gap-2">
          <Label>Exceptions</Label>
          {draft.exceptions.length === 0 && (
            <p className="-mt-1 text-xs text-muted-foreground">
              {published ? "None. Exceptions on a published week change in a correction on Enter Results." : "None. Every couple has a slot."}
            </p>
          )}
          {draft.exceptions.map((x) => (
            <div key={x.coupleId} className="flex min-h-11 items-center gap-2 rounded-lg bg-muted/40 py-1 pr-1 pl-3">
              <span className="min-w-0 flex-1 text-sm">
                <span className="block truncate">{nameOf(x.coupleId)}</span>
                {x.note && <span className="block truncate text-xs text-muted-foreground">{x.note}</span>}
              </span>
              <Badge variant="outline">
                {EXCEPTION_LABEL[x.kind]}
                {x.kind === "immune" && x.bonusPoints != null ? ` · +${x.bonusPoints}` : ""}
              </Badge>
              {!published && (
                <Button type="button" size="icon" variant="ghost" aria-label={`Remove exception for ${nameOf(x.coupleId)}`} onClick={() => onException(x.coupleId, null)}>
                  <XIcon className="size-4" />
                </Button>
              )}
            </div>
          ))}
          {!published &&
            (marking ? (
              <ExceptionForm
                couples={couples.filter((c) => !draft.exceptions.some((x) => x.coupleId === c.id))}
                allowImmune={special}
                onCancel={() => onMarking(false)}
                onSave={(coupleId, exception) => onException(coupleId, exception)}
              />
            ) : (
              <Button type="button" size="sm" variant="ghost" className="self-start text-accent" onClick={() => onMarking(true)}>
                <PlusIcon className="size-4" />
                Mark a Couple
              </Button>
            ))}
        </div>
      )}

      {checks.length > 0 && (
        <div className="flex flex-col gap-2">
          {checks.map((check) => (
            <p
              key={check.message}
              role={check.tone === "danger" ? "alert" : undefined}
              className={cn("rounded-lg border px-3 py-2 text-xs leading-snug", CHECK_TONE[check.tone])}
            >
              {check.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function UnitMembers({
  label,
  members,
  couples,
  headToHead,
  onChange,
}: {
  label: string;
  members: string[];
  couples: Couple[];
  headToHead: boolean;
  onChange: (members: string[]) => void;
}) {
  const items = Object.fromEntries(couples.map((c) => [c.id, c.name]));
  if (headToHead) {
    const slot = (i: number) => (
      <Select
        items={{ [NO_COUPLE]: "Pick a Couple", ...items }}
        value={members[i] ?? NO_COUPLE}
        onValueChange={(v) => {
          const next = [members[0] ?? "", members[1] ?? ""];
          next[i] = v && v !== NO_COUPLE ? v : "";
          onChange(next.filter(Boolean));
        }}
      >
        <SelectTrigger className="min-w-0 flex-1" aria-label={`${label}, couple ${i + 1}`}>
          <SelectValue placeholder="Pick a Couple" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_COUPLE}>Pick a Couple</SelectItem>
          {couples.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-accent">{label}</span>
        <div className="flex items-center gap-2">
          {slot(0)}
          <span className="text-xs font-semibold text-muted-foreground">vs</span>
          {slot(1)}
        </div>
      </div>
    );
  }
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-accent">{label}</span>
      <div className="flex flex-wrap gap-1">
        {couples.map((c) => {
          const on = members.includes(c.id);
          return (
            <Button
              key={c.id}
              type="button"
              size="xs"
              variant={on ? "default" : "outline"}
              aria-pressed={on}
              onClick={() => onChange(on ? members.filter((cid) => cid !== c.id) : [...members, c.id])}
            >
              {c.name}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

function ExceptionForm({
  couples,
  allowImmune,
  onCancel,
  onSave,
}: {
  couples: Couple[];
  allowImmune: boolean;
  onCancel: () => void;
  onSave: (coupleId: string, exception: { kind: ExceptionKind; note: string | null; bonusPoints: number | null }) => void;
}) {
  const id = useId();
  const [coupleId, setCoupleId] = useState("");
  const [kind, setKind] = useState<ExceptionKind>(allowImmune ? "immune" : "not_dancing");
  const [note, setNote] = useState("");
  const [bonusText, setBonusText] = useState("");
  const kinds: ExceptionKind[] = allowImmune ? ["immune", "not_dancing", "withdrawn"] : ["not_dancing", "withdrawn"];
  const bonus = parseBonus(bonusText);
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-ring bg-accent/5 p-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-couple`}>Couple</Label>
        <Select items={Object.fromEntries(couples.map((c) => [c.id, c.name]))} value={coupleId || null} onValueChange={(v) => setCoupleId(v ?? "")}>
          <SelectTrigger id={`${id}-couple`} className="w-full">
            <SelectValue placeholder="Pick a Couple" />
          </SelectTrigger>
          <SelectContent>
            {couples.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div role="group" aria-labelledby={`${id}-reason`} className="flex flex-col gap-2">
        <Label id={`${id}-reason`}>Reason</Label>
        <div className="flex flex-wrap gap-2">
          {kinds.map((k) => (
            <Button key={k} type="button" size="sm" variant={kind === k ? "default" : "outline"} aria-pressed={kind === k} onClick={() => setKind(k)}>
              {EXCEPTION_LABEL[k]}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {kind === "immune"
            ? "Skips this round. They get the round's winner's bonus unless you set their own."
            : kind === "withdrawn"
              ? "Out of every round tonight. Sets their outcome to Withdrawn."
              : "Skips this round. They stay in the competition."}
        </p>
      </div>
      {kind === "immune" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-bonus`}>Their Bonus</Label>
          <div className="flex items-center gap-2">
            <Input
              id={`${id}-bonus`}
              inputMode="decimal"
              className="w-20 text-center"
              placeholder="—"
              aria-invalid={bonus.invalid}
              value={bonusText}
              onChange={(e) => setBonusText(e.target.value)}
            />
            <span className="text-sm text-muted-foreground">pts</span>
          </div>
          {bonus.invalid ? (
            <p role="alert" className="text-xs text-danger-text">
              {BONUS_MESSAGE}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Blank follows the round&apos;s winner&apos;s bonus.</p>
          )}
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-note`}>Note (Optional)</Label>
        <Input id={`${id}-note`} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={!coupleId || bonus.invalid}
          onClick={() => onSave(coupleId, { kind, note: note.trim() || null, bonusPoints: kind === "immune" ? bonus.value : null })}
        >
          Save Exception
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
