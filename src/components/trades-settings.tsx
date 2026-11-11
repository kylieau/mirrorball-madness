"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setTradesEnabled } from "@/app/leagues/[id]/trades/actions";
import { Button } from "@/components/ui/button";
import { TRADE_RULES } from "@/lib/trades";

export type TradesSettingsInput = { enabled: boolean; canEdit: boolean };

export function TradesSettings({ leagueId, enabled, canEdit }: TradesSettingsInput & { leagueId: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: boolean) {
    setError(null);
    setSaving(true);
    const result = await setTradesEnabled(leagueId, next);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm leading-none font-medium">Trades</p>
        <span className="text-sm font-medium">{enabled ? "On" : "Off"}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Managers swap couples, and points, with each other. Everyone in a trade has to accept, and the league can veto
        it.
      </p>
      {enabled && (
        <ul className="flex list-disc flex-col gap-1.5 pl-4 text-xs text-muted-foreground">
          {TRADE_RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      )}
      {canEdit && !enabled && (
        <Button variant="outline" size="sm" className="self-start" onClick={() => void save(true)} disabled={saving}>
          {saving ? "Turning on…" : "Turn On Trades"}
        </Button>
      )}
      {canEdit && enabled && (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="self-start px-0 text-danger-text"
            onClick={() => void save(false)}
            disabled={saving}
          >
            {saving ? "Turning off…" : "Turn Off Trades"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Turning Trades off cancels every offer and accepted trade that hasn&apos;t taken effect.
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
