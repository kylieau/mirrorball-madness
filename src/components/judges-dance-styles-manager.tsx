"use client";

import { useState } from "react";
import { addJudge, addDanceStyle, archiveJudge, restoreJudge } from "@/app/admin/results/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isJudgeArchived, type ScoringJudge } from "@/lib/scoring-judges";
import { PlusIcon } from "lucide-react";

type Named = { id: string; name: string };

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

  const active = judges.filter((j) => !isJudgeArchived(j));
  const archived = judges.filter((j) => isJudgeArchived(j));

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scoring judges</CardTitle>
        <CardDescription>
          The standing panel plus anyone who can give a score. Adding a name adds
          a score box on every dance. Archive a guest when they&apos;re done —
          history stays, they just drop off later weeks.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {active.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {active.map((judge) => (
              <li key={judge.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 text-sm font-medium">{judge.name}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pendingId === judge.id}
                  onClick={() => handleArchive(judge.id)}
                >
                  {pendingId === judge.id ? "Archiving..." : "Archive"}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No standing judges yet.</p>
        )}
        <div className="flex gap-2">
          <Input
            placeholder="Judge name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Button onClick={handleAdd} disabled={busy || !newName.trim()}>
            <PlusIcon className="size-4" />
            Add judge
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
              {archived.map((judge) => (
                <li key={judge.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 text-sm text-muted-foreground">{judge.name}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pendingId === judge.id}
                    onClick={() => handleRestore(judge.id)}
                  >
                    {pendingId === judge.id ? "Restoring..." : "Restore"}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function JudgesDanceStylesManager({
  judges,
  danceStyles,
}: {
  judges: ScoringJudge[];
  danceStyles: Named[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <ScoringJudgesCard judges={judges} />

      <NamedItemsCard
        title="Dance Styles"
        items={danceStyles}
        placeholder="New Dance Style"
        addLabel="Add dance style"
        onAdd={addDanceStyle}
      />
    </div>
  );
}
