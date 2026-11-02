"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CoupleName } from "@/components/couple-name";
import type { CoupleNameParts } from "@/lib/couple-display";
import type { EpisodeTeam, TeamSetupInput } from "@/lib/team-dances";
import { PlusIcon } from "lucide-react";

export type TeamDraft = {
  key: string;
  id: string | null;
  name: string;
  songTitle: string;
  songSource: string;
  danceStyleId: string;
  captainCoupleId: string | null;
  hostName: string;
  memberCoupleIds: string[];
};

export type EditorCouple = { id: string; parts: CoupleNameParts };

// An inferred team has no row yet, so it arrives as a new team named after
// its song with the members and song already filled in.
export function teamDraftsFromTeams(teams: EpisodeTeam[]): TeamDraft[] {
  return teams.map((t) => ({
    key: t.id,
    id: t.inferred ? null : t.id,
    name: t.name,
    songTitle: t.songTitle ?? "",
    songSource: t.songSource ?? "",
    danceStyleId: t.danceStyleId,
    captainCoupleId: t.captainCoupleId,
    hostName: t.hostName ?? "",
    memberCoupleIds: [...t.memberCoupleIds],
  }));
}

export function newTeamDraft(defaultStyleId: string, index: number): TeamDraft {
  return {
    key: `new-${index}-${Date.now()}`,
    id: null,
    name: "",
    songTitle: "",
    songSource: "",
    danceStyleId: defaultStyleId,
    captainCoupleId: null,
    hostName: "",
    memberCoupleIds: [],
  };
}

export function teamDraftsToSetup(drafts: TeamDraft[]): TeamSetupInput[] {
  return drafts.map((t, i) => ({
    id: t.id,
    name: t.name.trim(),
    songTitle: t.songTitle.trim() || null,
    songSource: t.songSource.trim() || null,
    danceStyleId: t.danceStyleId || null,
    captainCoupleId: t.captainCoupleId,
    hostName: t.hostName.trim() || null,
    sortOrder: i + 1,
    memberCoupleIds: [...t.memberCoupleIds],
  }));
}

// Controlled. The caller owns the drafts and the save; this only edits them.
// Member rows reuse the Who's Performing checklist shape, and a couple on the
// other team shows locked with that team's name.
export function TeamEditor({
  teams,
  onChange,
  couples,
  danceStyles,
  defaultStyleId,
  disabled = false,
}: {
  teams: TeamDraft[];
  onChange: (teams: TeamDraft[]) => void;
  couples: EditorCouple[];
  danceStyles: { id: string; name: string }[];
  defaultStyleId: string;
  disabled?: boolean;
}) {
  const styleItems = Object.fromEntries(danceStyles.map((s) => [s.id, s.name]));
  const teamByCouple = new Map<string, TeamDraft>();
  for (const team of teams) for (const coupleId of team.memberCoupleIds) teamByCouple.set(coupleId, team);

  function update(key: string, patch: Partial<TeamDraft>) {
    onChange(teams.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  }

  function toggleMember(team: TeamDraft, coupleId: string) {
    const on = team.memberCoupleIds.includes(coupleId);
    const memberCoupleIds = on ? team.memberCoupleIds.filter((id) => id !== coupleId) : [...team.memberCoupleIds, coupleId];
    update(team.key, {
      memberCoupleIds,
      captainCoupleId: on && team.captainCoupleId === coupleId ? null : team.captainCoupleId,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {teams.length === 0 && <p className="text-sm text-muted-foreground">No teams yet.</p>}
      {teams.map((team, index) => (
        <fieldset key={team.key} disabled={disabled} className="flex min-w-0 flex-col gap-3 rounded-xl border border-border p-3">
          <legend className="sr-only">Team {index + 1}</legend>
          <div className="flex items-center justify-between">
            <p className="font-heading text-base font-semibold">Team {index + 1}</p>
            <Button
              size="xs"
              variant="ghost"
              className="text-danger-text"
              onClick={() => onChange(teams.filter((t) => t.key !== team.key))}
            >
              Remove
            </Button>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`team-name-${team.key}`}>Team Name</Label>
            <Input
              id={`team-name-${team.key}`}
              placeholder="e.g. Slaytopia"
              value={team.name}
              onChange={(e) => update(team.key, { name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={`team-song-${team.key}`}>Song</Label>
              <Input
                id={`team-song-${team.key}`}
                placeholder="Song title"
                value={team.songTitle}
                onChange={(e) => update(team.key, { songTitle: e.target.value })}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={`team-source-${team.key}`}>Source Show</Label>
              <Input
                id={`team-source-${team.key}`}
                placeholder="e.g. Zootopia 2"
                value={team.songSource}
                onChange={(e) => update(team.key, { songSource: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label>Style</Label>
              <Select
                items={styleItems}
                value={team.danceStyleId || defaultStyleId}
                onValueChange={(v) => update(team.key, { danceStyleId: v ?? defaultStyleId })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {danceStyles.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={`team-host-${team.key}`}>Host</Label>
              <Input
                id={`team-host-${team.key}`}
                placeholder="e.g. Alfonso Ribeiro"
                value={team.hostName}
                onChange={(e) => update(team.key, { hostName: e.target.value })}
              />
            </div>
          </div>
          <p className="-mt-1.5 text-xs text-muted-foreground">
            The host dances with the team but isn&apos;t scored or on a roster.
            {team.songTitle.trim() === "" &&
              " Add the song too: it is how a member's team dance is told apart from a Freestyle of their own."}
          </p>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Members</Label>
              <span className="text-xs text-muted-foreground">{team.memberCoupleIds.length} selected</span>
            </div>
            <div className="flex flex-col rounded-lg border border-border">
              {couples.map((couple) => {
                const owner = teamByCouple.get(couple.id);
                const onOtherTeam = owner != null && owner.key !== team.key;
                const checked = team.memberCoupleIds.includes(couple.id);
                return (
                  <div
                    key={couple.id}
                    className={`flex min-h-11 items-center justify-between gap-2 border-b border-border px-2 last:border-b-0 ${onOtherTeam ? "text-muted-foreground" : ""}`}
                  >
                    <label className="flex flex-1 items-center gap-2 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={onOtherTeam}
                        onChange={() => toggleMember(team, couple.id)}
                      />
                      <CoupleName {...couple.parts} />
                    </label>
                    {onOtherTeam ? (
                      <span className="text-xs italic text-muted-foreground">On {owner.name.trim() || "another team"}</span>
                    ) : (
                      <label className="flex items-center gap-1 text-xs text-muted-foreground">
                        <input
                          type="radio"
                          name={`captain-${team.key}`}
                          checked={team.captainCoupleId === couple.id}
                          disabled={!checked}
                          onChange={() => update(team.key, { captainCoupleId: couple.id })}
                        />
                        Captain
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
            {teams.length > 1 && (
              <p className="text-xs text-muted-foreground">
                A couple can be on one team only. The other team&apos;s members are locked here.
              </p>
            )}
          </div>
        </fieldset>
      ))}
      <Button
        variant="outline"
        className="self-start"
        disabled={disabled}
        onClick={() => onChange([...teams, newTeamDraft(defaultStyleId, teams.length)])}
      >
        <PlusIcon className="size-4" />
        Add Team
      </Button>
      <p className="text-xs text-muted-foreground">
        Withdrawn on the night? Mark it on Enter Results as usual. That couple is skipped when the team score
        applies, and the team keeps its other members. No scores are saved here, so nothing blocks posting a
        couple&apos;s individual dance.
      </p>
    </div>
  );
}
