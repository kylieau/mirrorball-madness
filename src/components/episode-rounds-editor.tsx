"use client";

import { useState } from "react";
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
const KIND_BADGE: Record<RoundDraft["kind"], string> = { own: "Every Couple", special: "Special", none: "Elimination Only" };
const CHECK_TONE: Record<PairingCheck["tone"], string> = {
  danger: "border-destructive/50 bg-destructive/10 text-danger-text",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-text",
  muted: "border-border bg-muted/40 text-muted-foreground",
  ok: "border-emerald/40 bg-emerald/10 text-emerald-text",
};

function isHeadToHead(draft: Pick<RoundDraft, "roundType" | "scoring">): boolean {
  return /dance-?off/i.test(draft.roundType) && draft.scoring !== "ranked_points";
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
      <button
        key={`${option.kind}-${option.roundType}`}
        type="button"
        className="flex min-h-11 w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-accent/15"
        onClick={() => addRound(option)}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold">{option.roundType}</span>
          <span className="block text-[11px] leading-snug text-muted-foreground">{option.description}</span>
        </span>
      </button>
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
              className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
              placeholder="Search or Type a Round"
              value={search}
              maxLength={40}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {typed && !known && (
            <>
              <p className="px-2 pt-2 pb-1 text-[11px] font-bold tracking-[0.12em] text-muted-foreground">ADD &ldquo;{typed.toUpperCase()}&rdquo;</p>
              {optionRow({ roundType: typed, kind: "own", description: "Every couple dances their own", scoring: "marks", unitCount: 0 })}
              {optionRow({ roundType: typed, kind: "special", description: "A special dance in heats or groups", scoring: "fixed_bonus", unitCount: 1 })}
            </>
          )}
          {OWN_ROUND_OPTIONS.some(matches) && (
            <p className="px-2 pt-2 pb-1 text-[11px] font-bold tracking-[0.12em] text-muted-foreground">EVERY COUPLE DANCES THEIR OWN</p>
          )}
          {OWN_ROUND_OPTIONS.filter(matches).map(optionRow)}
          {SPECIAL_ROUND_OPTIONS.some(matches) && (
            <p className="px-2 pt-2 pb-1 text-[11px] font-bold tracking-[0.12em] text-muted-foreground">SPECIAL DANCES · GROUPS AND HEATS</p>
          )}
          {SPECIAL_ROUND_OPTIONS.filter(matches).map(optionRow)}
          {ELIMINATION_ROUND_OPTIONS.some(matches) && (
            <p className="px-2 pt-2 pb-1 text-[11px] font-bold tracking-[0.12em] text-muted-foreground">NO POINTS · ELIMINATION ONLY</p>
          )}
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
  const locked = position === 1;
  const special = draft.kind === "special";
  const noun = unitNoun(draft);
  const checks =
    special && draft.units
      ? pairingChecks({ round: draft, units: draft.units, exceptions: draft.exceptions, castIds: couples.map((c) => c.id), name: nameOf })
      : [];

  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border p-3", special ? "border-primary/50 bg-primary/[0.04]" : "border-border bg-card/60")}>
      <div className="flex items-center gap-2">
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary font-heading text-sm font-semibold text-primary-foreground">
          {position}
        </span>
        <p className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <span className="font-heading text-[15px] font-semibold">{draft.roundType || "New Round"}</span>
          <Badge variant={special ? "default" : "secondary"}>{KIND_BADGE[draft.kind]}</Badge>
        </p>
        {locked ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
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
        <div className="flex flex-col gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-2.5">
          <p className="text-[13px]">
            Remove Round {position}
            {special ? ` and its ${draft.unitCount} ${draft.unitCount === 1 ? noun.toLowerCase().replace(/s$/, "") : noun.toLowerCase()}` : ""}?
            {draft.exceptions.length > 0 ? " Its exceptions go with it." : ""} A {noun.toLowerCase().replace(/s$/, "")} that already has scores
            stops the save; clear it on Enter Results first.
          </p>
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
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Round Name</Label>
          <Input value={draft.roundType} maxLength={40} onChange={(e) => onPatch((d) => ({ ...d, roundType: e.target.value }))} />
          {draft.kind === "own" && (
            <p className="text-xs text-muted-foreground">Adds a dance to every couple on Enter Results. Style and song are typed there.</p>
          )}
          {draft.kind === "none" && <p className="text-xs text-muted-foreground">Decides the elimination only. Nothing is scored.</p>}
        </div>
      )}

      {special && (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Scoring</span>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/60 p-1">
              {SPECIAL_SCORING_OPTIONS.map((option) => (
                <button
                  key={option.scoring}
                  type="button"
                  className={cn(
                    "min-h-11 rounded-md px-2 text-[13px] font-medium",
                    draft.scoring === option.scoring ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground"
                  )}
                  onClick={() =>
                    onPatch((d) => ({
                      ...d,
                      scoring: option.scoring,
                      units: option.scoring === "team_marks" ? null : (d.units ?? Array.from({ length: d.unitCount }, () => [])),
                    }))
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{SPECIAL_SCORING_OPTIONS.find((o) => o.scoring === draft.scoring)?.help}</p>
            {draft.scoring === "fixed_bonus" && (
              <div className="flex items-center gap-2">
                <Label htmlFor={`bonus-${draft.key}`} className="text-xs">
                  Winner&apos;s Bonus (pts)
                </Label>
                <Input
                  id={`bonus-${draft.key}`}
                  inputMode="decimal"
                  className="w-20 text-center"
                  placeholder="—"
                  value={draft.bonusPoints ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    onPatch((d) => ({ ...d, bonusPoints: raw === "" || Number.isNaN(Number(raw)) ? null : Number(raw) }));
                  }}
                />
                <span className="text-xs text-muted-foreground">Optional · Can Be Set on the Night</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{noun}</span>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
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
                <span className="inline-flex h-11 w-12 items-center justify-center rounded-lg border border-input font-heading text-lg font-semibold">
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
                  : "Team names and members are set inline in each team's panel on Enter Results."}
              </p>
            </div>
          </div>

          {draft.units && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{isHeadToHead(draft) ? "Pairings" : "Participants"}</span>
                <span className="text-xs text-muted-foreground">Optional · Can Be Set on the Night</span>
              </div>
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
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Exceptions</span>
            <span className="text-xs text-muted-foreground">{published ? "Change in a Correction" : "Optional"}</span>
          </div>
          {draft.exceptions.length === 0 && <p className="text-xs italic text-muted-foreground">None. Every couple has a slot.</p>}
          {draft.exceptions.map((x) => (
            <div key={x.coupleId} className="flex min-h-11 items-center gap-2 rounded-lg bg-muted/40 py-1 pr-1 pl-3">
              <span className="min-w-0 flex-1 text-[13px]">
                <span className="block truncate">{nameOf(x.coupleId)}</span>
                {x.note && <span className="block truncate text-xs text-muted-foreground">{x.note}</span>}
              </span>
              <Badge variant={x.kind === "immune" ? "default" : "secondary"}>
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
              <Button type="button" variant="outline" className="w-full" onClick={() => onMarking(true)}>
                <PlusIcon className="size-4" />
                Mark a Couple
              </Button>
            ))}
        </div>
      )}

      {checks.map((check) => (
        <p key={check.message} className={cn("rounded-lg border px-3 py-2 text-xs leading-snug", CHECK_TONE[check.tone])}>
          {check.message}
        </p>
      ))}
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
        <div className="flex items-center gap-1.5">
          {slot(0)}
          <span className="text-xs font-bold text-muted-foreground">vs</span>
          {slot(1)}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
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
              onClick={() => onChange(on ? members.filter((id) => id !== c.id) : [...members, c.id])}
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
  const [coupleId, setCoupleId] = useState("");
  const [kind, setKind] = useState<ExceptionKind>(allowImmune ? "immune" : "not_dancing");
  const [note, setNote] = useState("");
  const [bonus, setBonus] = useState("");
  const kinds: ExceptionKind[] = allowImmune ? ["immune", "not_dancing", "withdrawn"] : ["not_dancing", "withdrawn"];
  const bonusValue = bonus.trim() === "" ? null : Number(bonus);
  const bonusInvalid = bonusValue != null && (Number.isNaN(bonusValue) || bonusValue * 2 !== Math.trunc(bonusValue * 2) || Math.abs(bonusValue) > 100);
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-ring bg-accent/5 p-2.5">
      <Select items={Object.fromEntries(couples.map((c) => [c.id, c.name]))} value={coupleId || null} onValueChange={(v) => setCoupleId(v ?? "")}>
        <SelectTrigger className="w-full" aria-label="Couple">
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
      <div className="flex flex-wrap gap-1.5">
        {kinds.map((k) => (
          <Button key={k} type="button" variant={kind === k ? "default" : "outline"} className="rounded-full" onClick={() => setKind(k)}>
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
      {kind === "immune" && (
        <div className="flex items-center gap-2">
          <Label className="text-xs">Their Bonus (pts)</Label>
          <Input inputMode="decimal" className={cn("w-20 text-center", bonusInvalid && "border-destructive")} placeholder="Round's" value={bonus} onChange={(e) => setBonus(e.target.value)} />
        </div>
      )}
      <Input placeholder="Note (Optional)" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={!coupleId || bonusInvalid}
          onClick={() => onSave(coupleId, { kind, note: note.trim() || null, bonusPoints: kind === "immune" ? bonusValue : null })}
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

