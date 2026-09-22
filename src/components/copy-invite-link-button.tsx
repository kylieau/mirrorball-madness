"use client";

import { useState } from "react";
import { CopyIcon, CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CopyInviteLinkButton({
  inviteCode,
  basePath = "/join",
  label = "Copy Invite Link",
  size = "sm",
}: {
  inviteCode: string;
  basePath?: string;
  label?: string;
  size?: "sm" | "default";
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const link = `${window.location.origin}${basePath}/${inviteCode}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button type="button" variant="outline" size={size} onClick={handleCopy}>
      {copied ? (
        <>
          <CheckIcon className="size-4" /> Copied
        </>
      ) : (
        <>
          <CopyIcon className="size-4" /> {label}
        </>
      )}
    </Button>
  );
}
