"use client";

import { useEffect, useState } from "react";
import {
  addJudge,
  addDanceStyle,
  addRoundType,
  archiveJudge,
  restoreJudge,
  renameJudge,
  setDanceStyleCategory,
} from "@/app/admin/results/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isJudgeArchived, type ScoringJudge } from "@/lib/scoring-judges";
import { PlusIcon } from "lucide-react";

type Named = { id: string; name: string };
type DanceStyle = Named & { category: string | null };
type DanceStyleCategory = "ballroom" | "latin" | "show";

const DANCE_STYLE_CATEGORY_ITEMS: Record<DanceStyleCategory, string> = {
  ballroom: "Ballroom",
  latin: "Latin",
  show: "Show",
};

function isDanceStyleCategory(value: string | null): value is DanceStyleCategory {
  return value === "ballroom" || value === "latin" || value === "show";
}

function NamedItemsCard({
  title,
  description,
  items,
  placeholder,
  addLabel,
  onAdd,
}: {
  title: string;
  description?: string;
  items: Named[];
  placeholder: string;
  addLabel: string;
  onAdd: (name: string) => Promise<{ error: string | null }>;
}) {
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleAdd() {
    setError(null);
    setBusy(true);
    const result = await onAdd(newName);
    if (result.error) setError(result.error);
    else setNewName("");
    setBusy(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {items.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {items.map((item) => (
              <Badge key={item.id} variant="secondary">
                {item.name}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">None yet.</p>
        )}
        <div className="flex gap-2">
          <Input
            placeholder={placeholder}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Button onClick={handleAdd} disabled={busy || !newName.trim()}>
            <PlusIcon className="size-4" />
            {addLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ScoringJudgesCard({ judges }: { judges: ScoringJudge[] }) {
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const active = judges.filter((j) => !isJudgeArchived(j));
  const archived = judges.filter((j) => isJudgeArchived(j));
  const rowLocked = pendingId !== null || editingId !== null;

  async function handleAdd() {
    setError(null);
    setBusy(true);
    const result = await addJudge(newName);
    if (result.error) setError(result.error);
    else setNewName("");
    setBusy(false);
  }

  async function handleArchive(id: string) {
    setError(null);
    setPendingId(id);
    const result = await archiveJudge(id);
    if (result.error) setError(result.error);
    setPendingId(null);
  }

  async function handleRestore(id: string) {
    setError(null);
    setPendingId(id);
    const result = await restoreJudge(id);
    if (result.error) setError(result.error);
    setPendingId(null);
  }

  function startEdit(judge: ScoringJudge) {
    setError(null);
    setEditingId(judge.id);
    setEditName(judge.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  async function handleRename(id: string) {
    setError(null);
    setPendingId(id);
    const result = await renameJudge(id, editName);
    if (result.error) {
      setError(result.error);
      setPendingId(null);
      return;
    }
    setEditingId(null);
    setEditName("");
    setPendingId(null);
  }

  function renderJudgeRow(judge: ScoringJudge, archivedRow: boolean) {
    const isEditing = editingId === judge.id;
    const isPending = pendingId === judge.id;

    if (isEditing) {
      return (
        <li key={judge.id}>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void handleRename(judge.id);
            }}
          >
            <Input
              aria-label="Judge Name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  cancelEdit();
                }
              }}
              autoFocus
              disabled={isPending}
            />
            <Button type="submit" size="sm" disabled={isPending || !editName.trim()}>
              {isPending ? "Saving..." : "Save"}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={isPending} onClick={cancelEdit}>
              Cancel
            </Button>
          </form>
        </li>
      );
    }

    return (
      <li key={judge.id} className="flex items-center justify-between gap-3">
        <span
          className={
            archivedRow
              ? "min-w-0 truncate text-sm text-muted-foreground"
              : "min-w-0 truncate text-sm font-medium"
          }
        >
          {judge.name}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={rowLocked}
            onClick={() => startEdit(judge)}
          >
            Edit
          </Button>
          {archivedRow ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={rowLocked}
              onClick={() => handleRestore(judge.id)}
            >
              {isPending ? "Restoring..." : "Restore"}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={rowLocked}
              onClick={() => handleArchive(judge.id)}
            >
              {isPending ? "Archiving..." : "Archive"}
            </Button>
          )}
        </div>
      </li>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scoring Judges</CardTitle>
        <CardDescription>
          The standing panel plus anyone who can give a score. Adding a name adds
          a score box on every dance. Archive a guest when they&apos;re done —
          history stays, they just drop off later weeks. Edit fixes a typo
          without creating a new judge.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {active.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {active.map((judge) => renderJudgeRow(judge, false))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No standing judges yet.</p>
        )}
        <div className="flex gap-2">
          <Input
            placeholder="Judge Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={rowLocked}
          />
          <Button onClick={handleAdd} disabled={busy || rowLocked || !newName.trim()}>
            <PlusIcon className="size-4" />
            Add Judge
          </Button>
        </div>
        {archived.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <div>
              <p className="text-sm font-medium">Archived</p>
              <p className="text-xs text-muted-foreground">
                Hidden from empty score boxes. Restore to put them back on every
                dance.
              </p>
            </div>
            <ul className="flex flex-col gap-2">
              {archived.map((judge) => renderJudgeRow(judge, true))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DanceStylesCard({ danceStyles }: { danceStyles: DanceStyle[] }) {
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(danceStyles.map((style) => [style.id, style.category]))
  );

  useEffect(() => {
    setCategories(Object.fromEntries(danceStyles.map((style) => [style.id, style.category])));
  }, [danceStyles]);

  async function handleAdd() {
    setError(null);
    setBusy(true);
    const result = await addDanceStyle(newName);
    if (result.error) setError(result.error);
    else setNewName("");
    setBusy(false);
  }

  async function handleCategory(styleId: string, category: DanceStyleCategory | null) {
    const previous = categories[styleId] ?? null;
    setCategories((prev) => ({ ...prev, [styleId]: category }));
    setError(null);
    setPendingId(styleId);
    const result = await setDanceStyleCategory(styleId, category);
    if (result.error) {
      setError(result.error);
      setCategories((prev) => ({ ...prev, [styleId]: previous }));
    }
    setPendingId(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dance Styles</CardTitle>
        <CardDescription>
          What was danced. Pick a category on the row after adding the style.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {danceStyles.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {danceStyles.map((style) => (
              <li key={style.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-medium">{style.name}</span>
                <Select
                  items={DANCE_STYLE_CATEGORY_ITEMS}
                  value={categories[style.id] ?? null}
                  disabled={pendingId === style.id}
                  onValueChange={(value) => {
                    void handleCategory(style.id, isDanceStyleCategory(value) ? value : null);
                  }}
                >
                  <SelectTrigger className="w-36" aria-label={`Category for ${style.name}`}>
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(DANCE_STYLE_CATEGORY_ITEMS) as DanceStyleCategory[]).map((value) => (
                      <SelectItem key={value} value={value}>
                        {DANCE_STYLE_CATEGORY_ITEMS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">None yet.</p>
        )}
        <div className="flex gap-2">
          <Input
            placeholder="New Dance Style"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Button onClick={handleAdd} disabled={busy || !newName.trim()}>
            <PlusIcon className="size-4" />
            Add Dance Style
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function JudgesDanceStylesManager({
  judges,
  danceStyles,
  roundTypes,
}: {
  judges: ScoringJudge[];
  danceStyles: DanceStyle[];
  roundTypes: Named[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <ScoringJudgesCard judges={judges} />
      <DanceStylesCard danceStyles={danceStyles} />
      <NamedItemsCard
        title="Round Types"
        description="The format a night is built around. Assign them on the episode in Schedule."
        items={roundTypes}
        placeholder="New Round Type"
        addLabel="Add Round Type"
        onAdd={addRoundType}
      />
    </div>
  );
}
