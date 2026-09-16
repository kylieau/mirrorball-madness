"use client";

import { useState } from "react";
import { addJudge, addDanceStyle } from "@/app/admin/results/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

export function JudgesDanceStylesManager({
  judges,
  danceStyles,
}: {
  judges: Named[];
  danceStyles: Named[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <NamedItemsCard
        title="Scoring judges"
        description="The standing panel plus anyone who can give a score. Adding a name adds a score box on every dance — leave it blank on weeks they didn't judge."
        items={judges}
        placeholder="Judge name"
        addLabel="Add judge"
        onAdd={addJudge}
      />

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
