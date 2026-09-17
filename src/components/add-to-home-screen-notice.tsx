"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ADD_TO_HOME_SCREEN_COPY,
  INSTALL_STEPS,
  detectInstallPlatform,
  detectInstallSurface,
  shouldShowInstallSteps,
  type InstallPlatform,
  type InstallSurface,
} from "@/lib/add-to-home-screen";

function readStandaloneDisplay(): boolean {
  const safariStandalone =
    "standalone" in window.navigator &&
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  return window.matchMedia("(display-mode: standalone)").matches || safariStandalone;
}

function useInstallAudience(): {
  ready: boolean;
  platform: InstallPlatform;
  setPlatform: (platform: InstallPlatform) => void;
  surface: InstallSurface;
} {
  const [ready, setReady] = useState(false);
  const [platform, setPlatform] = useState<InstallPlatform>("ios");
  const [surface, setSurface] = useState<InstallSurface>("browser");

  useEffect(() => {
    setPlatform(
      detectInstallPlatform({
        userAgent: navigator.userAgent,
        maxTouchPoints: navigator.maxTouchPoints,
      })
    );
    setSurface(
      detectInstallSurface({
        isNativePlatform: Capacitor.isNativePlatform(),
        isStandaloneDisplay: readStandaloneDisplay(),
      })
    );
    setReady(true);
  }, []);

  return { ready, platform, setPlatform, surface };
}

function PlatformToggle({
  platform,
  onPlatformChange,
}: {
  platform: InstallPlatform;
  onPlatformChange: (platform: InstallPlatform) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {(["ios", "android"] as const).map((value) => (
        <Button
          key={value}
          type="button"
          size="sm"
          variant={platform === value ? "default" : "outline"}
          className="rounded-full"
          onClick={() => onPlatformChange(value)}
        >
          {INSTALL_STEPS[value].label}
        </Button>
      ))}
    </div>
  );
}

function InstallSteps({ platform }: { platform: InstallPlatform }) {
  const copy = INSTALL_STEPS[platform];
  return (
    <div className="flex flex-col gap-3">
      <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
        {copy.steps.map((step) => (
          <li key={step}>
            <span className="text-foreground">{step}</span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">{copy.footnote}</p>
    </div>
  );
}

function SurfaceNote({ surface }: { surface: InstallSurface }) {
  if (surface === "native") {
    return (
      <p className="text-sm text-muted-foreground">
        You&apos;re in the iOS app. These steps are for browser users. Push delivery
        still isn&apos;t built — in-app picks-due is what you have today.
      </p>
    );
  }
  if (surface === "standalone") {
    return (
      <p className="text-sm text-muted-foreground">
        You&apos;re already opening this from the Home Screen. When we start sending
        alerts, allow notifications from this icon — not a Safari tab.
      </p>
    );
  }
  return null;
}

export function AddToHomeScreenNotice({
  defaultOpen = true,
}: {
  defaultOpen?: boolean;
}) {
  const { ready, platform, setPlatform, surface } = useInstallAudience();
  const [open, setOpen] = useState(defaultOpen);

  if (!ready) return null;

  return (
    <Card>
      <CardContent className="py-0">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
          className="flex w-full items-start justify-between gap-3 py-3 text-left"
        >
          <span className="font-heading text-sm font-medium text-foreground">
            {ADD_TO_HOME_SCREEN_COPY.accordionTitle}
          </span>
          <ChevronDownIcon
            className={cn(
              "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
          />
        </button>
        {open && (
          <div className="flex flex-col gap-4 border-t border-border pb-3 pt-3">
            <p className="text-sm text-muted-foreground">{ADD_TO_HOME_SCREEN_COPY.intro}</p>
            <SurfaceNote surface={surface} />
            {shouldShowInstallSteps(surface) && (
              <>
                <PlatformToggle platform={platform} onPlatformChange={setPlatform} />
                <InstallSteps platform={platform} />
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
