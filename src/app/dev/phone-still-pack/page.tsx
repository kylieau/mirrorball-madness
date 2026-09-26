import { Suspense, type ReactNode } from "react";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { XIcon } from "lucide-react";
import { CreateJoinLeagueDialogs } from "@/components/create-join-league-dialogs";
import { EpisodeBanner } from "@/components/episode-banner";
import { FanBottomNav, BOTTOM_NAV_CLEARANCE } from "@/components/bottom-nav";
import { LiveScoresPrompt } from "@/components/live-scores-prompt";
import { PageHeader } from "@/components/page-header";
import { SettingsSection } from "@/components/settings-section";
import { SpoilerFreeStrip, type SpoilerFreeStripState } from "@/components/spoiler-free-strip";
import { SpoilerModeToggle } from "@/components/spoiler-mode-toggle";
import { TopBar } from "@/components/top-bar";
import type { SpoilerProgress } from "@/lib/spoiler-progress";
import { CURTAIN_STILLS, curtainById } from "./fixtures";

// Dev-only preview of Home / Spoiler-Free states. Not a product route:
// production and any non-local host 404, and nothing in the app links here.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Phone still pack",
  robots: { index: false, follow: false },
};

const PREVIEW_ACCOUNT = {
  email: "preview@example.com",
  displayName: "Alex",
  isSuperAdmin: false,
  deletionRequestedAt: null,
  spoilerFreeMode: false,
  leagues: [],
  canProposeResults: false,
};

const WATCHED_PROGRESS: SpoilerProgress = {
  watchedThroughWeek: 3,
  weekNumbers: [5, 4, 3, 2, 1],
};

const READY_SINGLE: SpoilerFreeStripState = { kind: "ready", weekNumber: 4, earlierWeeks: [] };
const READY_MULTI: SpoilerFreeStripState = { kind: "ready", weekNumber: 4, earlierWeeks: [2, 3] };
const POSTING: SpoilerFreeStripState = { kind: "posting", weekNumber: 4, earlierWeeks: [2, 3] };
const WATCHING: SpoilerFreeStripState = { kind: "watching", weekNumber: 4 };

function isLocalDevHost(host: string): boolean {
  const hostname = host.split(":")[0];
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function HomeFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
        <Suspense fallback={null}>
          <TopBar {...PREVIEW_ACCOUNT} />
        </Suspense>
        <PageHeader title="Home" />
        <div className={BOTTOM_NAV_CLEARANCE}>{children}</div>
      </div>
      <FanBottomNav active="home" leagueId="preview" />
    </>
  );
}

function CurtainScene({ id }: { id: string }) {
  const scene = curtainById(id);
  if (!scene) notFound();
  return (
    <HomeFrame>
      <div
        data-scene={scene.id}
        data-banner-kind={scene.state.kind}
        data-rail-marker={scene.rail.marker}
        data-rail-week={scene.rail.currentWeek ?? ""}
      >
        <EpisodeBanner input={scene.input} initialState={scene.state} nowIso={scene.nowIso} />
      </div>
    </HomeFrame>
  );
}

function StripScene({ state, prompt = false }: { state: SpoilerFreeStripState; prompt?: boolean }) {
  return (
    <HomeFrame>
      <div data-scene={prompt ? "live-scores-prompt" : `strip-${state.kind}`}>
        {prompt && state.kind === "posting" && (
          <LiveScoresPrompt weekNumber={state.weekNumber} earlierWeeks={state.earlierWeeks} />
        )}
        <SpoilerFreeStrip state={state} />
      </div>
    </HomeFrame>
  );
}

function CreateJoinScene() {
  return (
    <HomeFrame>
      <div data-scene="home-create-join" className="mt-3">
        <CreateJoinLeagueDialogs />
      </div>
    </HomeFrame>
  );
}

function SettingsScene() {
  return (
    <div data-scene="settings-last-watched" className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
      <XIcon className="size-5 text-muted-foreground" />
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <SettingsSection title="Account-Wide">
        <SpoilerModeToggle initialEnabled progress={WATCHED_PROGRESS} />
      </SettingsSection>
    </div>
  );
}

const SCENES: Record<string, ReactNode> = {
  "curtain-picks-open": <CurtainScene id="curtain-picks-open" />,
  "curtain-picks-locked": <CurtainScene id="curtain-picks-locked" />,
  "curtain-on-air-now": <CurtainScene id="curtain-on-air-now" />,
  "curtain-hold-the-curtain": <CurtainScene id="curtain-hold-the-curtain" />,
  "curtain-west-lets-dance": <CurtainScene id="curtain-west-lets-dance" />,
  "curtain-results-soon": <CurtainScene id="curtain-results-soon" />,
  "curtain-scores-are-in": <CurtainScene id="curtain-scores-are-in" />,
  "curtain-cc-off-curtain-up-soon": <CurtainScene id="curtain-cc-off-curtain-up-soon" />,
  "curtain-cc-off-time-to-vote": <CurtainScene id="curtain-cc-off-time-to-vote" />,
  "strip-ready": <StripScene state={READY_SINGLE} />,
  "strip-posting": <StripScene state={POSTING} />,
  "strip-watching": <StripScene state={WATCHING} />,
  "mark-watched-single": <StripScene state={READY_SINGLE} />,
  "mark-watched-choose-earlier": <StripScene state={READY_MULTI} />,
  "mark-watched-list": <StripScene state={READY_MULTI} />,
  "live-scores-prompt": <StripScene state={POSTING} prompt />,
  "home-create-join": <CreateJoinScene />,
  "settings-last-watched": <SettingsScene />,
  "settings-last-watched-open": <SettingsScene />,
};

export default async function PhoneStillPackPage({
  searchParams,
}: {
  searchParams: Promise<{ scene?: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const host = (await headers()).get("host") ?? "";
  if (!isLocalDevHost(host)) notFound();

  const { scene } = await searchParams;
  if (!scene) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-2 px-4 py-8 text-sm">
        <h1 className="font-heading text-2xl font-semibold">Phone still pack</h1>
        <p className="text-muted-foreground">Local preview only. Each link is one fixture state.</p>
        <ul className="mt-2 flex flex-col gap-1">
          {Object.keys(SCENES).map((id) => (
            <li key={id}>
              <Link className="text-primary underline" href={`/dev/phone-still-pack?scene=${id}`}>
                {id}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          Curtain fixtures: {CURTAIN_STILLS.map((s) => s.state.kind).join(", ")}
        </p>
      </div>
    );
  }

  const body = SCENES[scene];
  if (!body) notFound();
  return body;
}
