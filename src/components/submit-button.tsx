"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

// For forms posting to a server action: shows the pending label and blocks a
// second tap while the action runs.
export function SubmitButton({
  idleLabel,
  pendingLabel,
  ...props
}: { idleLabel: string; pendingLabel: string } & Omit<ComponentProps<typeof Button>, "type" | "children">) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? pendingLabel : idleLabel}
    </Button>
  );
}
