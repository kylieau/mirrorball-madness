"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setResultsContributor } from "@/app/admin/accounts/actions";
import { Button } from "@/components/ui/button";

export function ResultsContributors({ accounts }: { accounts: {
  id: string; display_name: string; can_propose_results: boolean; is_super_admin: boolean;
}[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function change(userId: string, enabled: boolean) {
    setPending(userId);
    setError(null);
    try {
      const result = await setResultsContributor(userId, enabled);
      if (result.error) setError(result.error);
      else router.refresh();
    } catch {
      setError("Could not update results access. Please try again.");
    } finally {
      setPending(null);
    }
  }
  return <section className="flex flex-col gap-3">
    <h2 className="font-heading text-lg font-semibold">Results Contributors</h2>
    <p className="text-sm text-muted-foreground">Trusted contributors can enter and release draft scores for every league. Only site admins can publish official results or correct a published episode.</p>
    {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
    <ul className="flex flex-col gap-2">
      {accounts.map((account) => <li key={account.id} className="flex items-center justify-between gap-3 border-b border-border pb-2 text-sm">
        <span className="min-w-0 break-words">{account.display_name}</span>
        {account.is_super_admin ? <span className="shrink-0 text-muted-foreground">Site admin</span> :
          <Button size="sm" variant="outline" disabled={pending !== null}
            onClick={() => change(account.id, !account.can_propose_results)}>
            {pending === account.id ? "Updating…" : account.can_propose_results ? "Remove Access" : "Allow Results Entry"}
          </Button>}
      </li>)}
    </ul>
  </section>;
}
