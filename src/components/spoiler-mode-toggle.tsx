"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { setSpoilerFreeMode } from "@/app/settings/actions";
import { WatchedThroughSetting } from "@/components/watched-through-setting";

export function SpoilerModeToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, setPending] = useState(false);

  async function handleChange(checked: boolean) {
    setEnabled(checked);
    setPending(true);
    const result = await setSpoilerFreeMode(checked);
    if (result.error) {
      setEnabled(!checked);
    } else {
      router.refresh();
    }
    setPending(false);
  }

  return (
    <div className="w-full border-t border-border first:border-t-0">
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
        <div>
          <p>Spoiler-Free Mode</p>
          <p className="text-xs text-muted-foreground">Hide results until you mark a week as watched</p>
        </div>
        <Switch checked={enabled} onCheckedChange={handleChange} disabled={pending} />
      </div>
      {enabled && <WatchedThroughSetting />}
    </div>
  );
}
