"use client";

import { Fragment, useEffect, useState } from "react";
import { cn } from "cn";
import {
  computeEpisodeBannerState,
  nextBannerRefreshMs,
  seasonTrack,
  type EpisodeBannerInput,
  type EpisodeBannerState,
  type SeasonTrackModel,
} from "@/lib/episode-banner";
import { formatAirsAt } from "@/lib/format-airs";
import { formatEpisodeCasual } from "@/lib/format-week";

// Total season length isn't known, so the track shows what's done, the
// current week, and hollow dots that fade out instead of a real "N of M". It
// holds seven nodes early in the season, then grows with the checked weeks.
const TRACK_NODES = 7;
const MIN_FUTURE_DOTS = 3;

// Titles longer than this drop a size step so the fixed-height curtain still fits.
const SHORT_TITLE_MAX = 12;

const CURTAIN_FOLDS =
  "bg-[repeating-linear-gradient(90deg,#5c1022_0_9px,#7d1a33_9px_18px,#5c1022_18px_27px)]";

type BannerCopy = { chip: string; title: string | null; sub: string | null; live: boolean };

const LETS_DANCE = "💃Let's Dance🕺";

// Chip = where the broadcast is, title = what the league can do, sub = what
// changes next. Times are viewer-local, so the labels arrive after mount.
function statusCopy(state: EpisodeBannerState, timeLabel: string): BannerCopy {
  const at = (prefix: string) => (timeLabel ? `${prefix} · ${timeLabel}` : null);
  switch (state.kind) {
    case "picks_open":
      return {
        chip: "Curtain Up Soon",
        title: state.picksModuleOn ? "Picks Open" : "Curtain Up Soon",
        sub: at("Live On Air"),
        live: false,
      };
    case "picks_locked":
      return { chip: "Curtain Up Soon", title: "Picks Locked", sub: at("Live On Air"), live: false };
    case "on_air":
      return {
        chip: "On Air (Live ET)",
        title: LETS_DANCE,
        sub: state.picksModuleOn ? "Picks Locked · Time to Vote" : "Time to Vote",
        live: true,
      };
    case "west_soon":
      return { chip: "Spoiler Lockdown", title: "Hold the Curtain", sub: at("West Coast Showtime"), live: false };
    case "west_watching":
      return { chip: "On Air (Live PT)", title: LETS_DANCE, sub: "No spoilers, darling", live: true };
    case "results_soon":
      return { chip: "Curtain Closed", title: "Results Soon", sub: "Tallying the scores", live: false };
    case "results_in":
      return { chip: "That's a Wrap", title: "Scores Are In", sub: "See where you landed", live: false };
  }
}

function SeasonTrack({ weeksDone, currentWeek, marker }: SeasonTrackModel) {
  const dots = [
    ...Array.from({ length: weeksDone }, () => ({ kind: "done" as const, label: "✓" })),
    ...(currentWeek === null ? [] : [{ kind: "current" as const, label: String(currentWeek) }]),
    ...Array.from({ length: Math.max(MIN_FUTURE_DOTS, TRACK_NODES - 1 - weeksDone) }, () => ({ kind: "future" as const, label: "" })),
  ];

  return (
    <div
      className="flex w-full items-center overflow-hidden px-1.5 pb-4 opacity-60"
      aria-hidden
    >
      {dots.map((dot, i) => (
        <Fragment key={i}>
          <span className="relative flex-none">
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
            {dot.kind === "current" && (
              <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-[8px] font-medium uppercase tracking-wider text-accent">
                {marker === "now" ? "Now" : "Next"}
              </span>
            )}
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

export function EpisodeBanner({
  input,
  initialState,
}: {
  input: EpisodeBannerInput;
  initialState: EpisodeBannerState | null;
}) {
  // The state moves with the clock, so it is re-derived here rather than only
  // at render time on the server. The first paint uses the server's state to
  // stay hydration-safe.
  const [state, setState] = useState(initialState);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setState(computeEpisodeBannerState(input));
      timer = setTimeout(tick, nextBannerRefreshMs(input.weeks));
    };
    tick();
    return () => clearTimeout(timer);
  }, [input]);

  const timeIso =
    state?.kind === "picks_open" || state?.kind === "picks_locked"
      ? state.airsAtIso
      : state?.kind === "west_soon"
        ? state.westStartIso
        : null;
  const [timeLabel, setTimeLabel] = useState("");
  useEffect(() => {
    setTimeLabel(timeIso ? formatAirsAt(timeIso) : "");
  }, [timeIso, state]);

  if (!state) return null;

  const track = seasonTrack(input.weeks, state);
  const { chip, title, sub, live } = statusCopy(state, timeLabel);
  const weekLabel = formatEpisodeCasual(state.weekNumber);

  return (
    <div className="relative mb-4 h-48 overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_at_50%_62%,rgba(255,232,170,0.4),rgba(255,232,170,0.07)_58%,#14060f_88%)] shadow-[0_6px_22px_rgba(0,0,0,0.45)]">
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
      <div className="relative mx-[13%] flex h-full flex-col items-center justify-center gap-2 px-3 pt-2 text-center">
        <p className="flex items-center gap-1.5 rounded-full border border-primary/60 bg-black/30 px-3 py-1 text-xs font-semibold text-primary">
          {live && <span className="inline-block size-[7px] rounded-full bg-[#ff4d5e]" />}
          {weekLabel}
          <span className="opacity-50">·</span>
          {chip}
        </p>
        {title && (
          <p
            className={cn(
              "text-balance font-heading font-black leading-tight text-foreground [text-shadow:0_0_22px_rgba(255,220,130,0.45)]",
              title.length > SHORT_TITLE_MAX ? "text-2xl" : "text-3xl"
            )}
          >
            {title}
          </p>
        )}
        {sub && <p className="text-[13px] text-accent">{sub}</p>}
        <div className="mt-1 w-full">
          <SeasonTrack {...track} />
        </div>
      </div>
    </div>
  );
}
