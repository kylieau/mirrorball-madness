"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { cn } from "cn";
import type { EpisodeBannerState } from "@/lib/episode-banner";
import { formatEpisodeCasual } from "@/lib/format-week";
import { useFormattedDeadline } from "@/lib/use-browser-time-zone";

// Total season length isn't known, so the track shows what's done, the
// current week, and a few hollow dots that fade out instead of a real "N of M".
const FUTURE_DOTS = 3;

const CURTAIN_FOLDS =
  "bg-[repeating-linear-gradient(90deg,#5c1022_0_9px,#7d1a33_9px_18px,#5c1022_18px_27px)]";

function statusCopy(state: EpisodeBannerState, formattedAirsAt: string) {
  if (state.kind === "on_air") {
    return { title: "On Air Now", sub: state.picksModuleOn ? "Picks are locked" : null };
  }
  return {
    title: state.picksModuleOn ? "Picks open" : null,
    sub: formattedAirsAt ? `Airs ${formattedAirsAt}` : null,
  };
}

function SeasonTrack({ weeksDone, weekNumber }: { weeksDone: number; weekNumber: number }) {
  const dots = [
    ...Array.from({ length: weeksDone }, () => ({ kind: "done" as const, label: "✓" })),
    { kind: "current" as const, label: String(weekNumber) },
    ...Array.from({ length: FUTURE_DOTS }, () => ({ kind: "future" as const, label: "" })),
  ];

  return (
    <div className="flex w-full items-center overflow-hidden px-1.5" aria-hidden>
      {dots.map((dot, i) => (
        <Fragment key={i}>
          <span
            className={cn(
              "grid size-4 flex-none place-items-center rounded-full border-[1.5px] text-[8.5px] font-semibold",
              dot.kind === "done" && "border-primary bg-primary text-primary-foreground",
              dot.kind === "current" &&
                "size-[22px] border-[#fff3c8] bg-primary text-[11px] text-primary-foreground shadow-[0_0_0_3px_rgba(230,197,111,0.22),0_0_14px_rgba(255,220,130,0.6)]",
              dot.kind === "future" && "border-primary/40 bg-black/30"
            )}
          >
            {dot.label}
          </span>
          <span
            className={cn(
              "h-0.5 min-w-[3px] flex-1",
              i < weeksDone ? "bg-primary" : "bg-primary/30",
              i === dots.length - 1 && "bg-linear-to-r from-primary/30 to-transparent"
            )}
          />
        </Fragment>
      ))}
    </div>
  );
}

export function EpisodeBanner({ state, weeksDone }: { state: EpisodeBannerState; weeksDone: number }) {
  const formattedAirsAt = useFormattedDeadline(state.kind === "picks_open" ? state.airsAtIso : null);
  const { title, sub } = statusCopy(state, formattedAirsAt);
  const weekLabel = formatEpisodeCasual(state.weekNumber);
  const onAir = state.kind === "on_air";

  const bannerRef = useRef<HTMLDivElement>(null);
  const [scrolledPast, setScrolledPast] = useState(false);
  useEffect(() => {
    const el = bannerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setScrolledPast(!entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div
        ref={bannerRef}
        className="relative mb-4 h-28 overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_at_50%_62%,rgba(255,232,170,0.4),rgba(255,232,170,0.07)_58%,#14060f_88%)] shadow-[0_6px_22px_rgba(0,0,0,0.45)]"
      >
        <div className="absolute inset-x-0 top-0 z-10 h-1.5 border-b-2 border-primary bg-linear-to-b from-[#3b0a17] to-[#5c1022]" />
        <div
          className={cn(
            "absolute inset-y-0 left-0 w-[13%] rounded-br-[50%_18%] border-r-2 border-primary/80 shadow-[inset_0_-20px_28px_rgba(0,0,0,0.35)]",
            CURTAIN_FOLDS
          )}
        />
        <div
          className={cn(
            "absolute inset-y-0 right-0 w-[13%] rounded-bl-[50%_18%] border-l-2 border-primary/80 shadow-[inset_0_-20px_28px_rgba(0,0,0,0.35)]",
            CURTAIN_FOLDS
          )}
        />
        <div className="absolute inset-y-0 top-2 right-[13%] left-[13%] flex flex-col items-center justify-center gap-2 pt-0.5">
          <div className="flex items-center gap-3">
            <div className="text-center leading-none">
              <span className="block pl-[0.22em] text-[8.5px] font-semibold uppercase tracking-[0.22em] text-primary">
                Week
              </span>
              <span className="mt-0.5 block font-heading text-4xl font-black text-foreground [text-shadow:0_0_22px_rgba(255,220,130,0.6)]">
                {state.weekNumber}
              </span>
            </div>
            <div>
              {title && (
                <p className="flex items-center text-[13px] font-semibold text-foreground">
                  {onAir && (
                    <span className="mr-1.5 inline-block size-[7px] rounded-full bg-[#ff4d5e]" />
                  )}
                  {title}
                </p>
              )}
              {sub && <p className="mt-px text-[11px] text-accent">{sub}</p>}
            </div>
          </div>
          <SeasonTrack weeksDone={weeksDone} weekNumber={state.weekNumber} />
        </div>
      </div>

      <div className="sticky top-0 z-30 h-0" aria-hidden>
        <div
          className={cn(
            "absolute inset-x-0 top-0 overflow-hidden rounded-b-xl border-b-2 border-primary shadow-[0_8px_18px_rgba(0,0,0,0.5)] transition duration-200 motion-reduce:transition-none",
            CURTAIN_FOLDS,
            scrolledPast ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0"
          )}
        >
          <div className="absolute inset-0 bg-linear-to-r from-black/5 via-black/55 to-black/5" />
          <p className="relative flex h-10 items-center gap-2 px-4 text-[13px] font-semibold text-foreground">
            {onAir && (
              <span className="inline-block size-[7px] rounded-full bg-[#ff4d5e]" />
            )}
            <span className="font-heading text-[15px] font-black text-primary">{weekLabel}</span>
            {title && (
              <>
                <span className="opacity-40">·</span>
                <span>{title}</span>
              </>
            )}
          </p>
        </div>
      </div>
    </>
  );
}
