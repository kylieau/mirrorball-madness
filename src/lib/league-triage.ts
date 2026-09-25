import { SCORING_MODULES, type ScoringModuleKey } from "./scoring-modules";

export function leagueTapHref(leagueId: string, picksDue: boolean): string {
  return `/leagues/${leagueId}?tab=${picksDue ? "yourpicks" : "standings"}`;
}

// open = picks can be made; awaiting_results = the previous week isn't published yet;
// no_week = no live week at all (pre-premiere or off-season).
export type CurtainCallState = "open" | "locked" | "awaiting_results" | "no_week";

export type ModuleStackInput = {
  curtainCall: {
    on: boolean;
    state: CurtainCallState;
    afterWeek: number | null;
    lockAt: string | null;
    eliminatedName: string | null;
    topScorerName: string | null;
  };
  danceCard: { on: boolean; draftStatus: string; rosterNames: string[] };
  grandFinale: {
    on: boolean;
    open: boolean;
    locked: boolean;
    deadlineAt: string | null;
    hasPrediction: boolean;
    nextElimName: string | null;
  };
};

export type ModuleLine = {
  key: ScoringModuleKey;
  name: string;
  text: string;
  tone: "needed" | "normal" | "dim";
  // A gold "Need …" tacked onto an otherwise normal line.
  needText: string | null;
  locked: boolean;
  locksAt: string | null;
};

type LineBody = Pick<ModuleLine, "text" | "tone" | "locked" | "locksAt"> & { needText?: string };

// One line per module that's on, in the canonical module order.
export function buildModuleStack(input: ModuleStackInput): ModuleLine[] {
  const { curtainCall: cc, danceCard: dc, grandFinale: gf } = input;

  const curtainCall = ((): LineBody => {
    const home = cc.eliminatedName && `Home: ${cc.eliminatedName}`;
    const high = cc.topScorerName && `High: ${cc.topScorerName}`;
    const picks = [home, high].filter(Boolean).join(" / ");
    switch (cc.state) {
      case "no_week":
        return { text: "Not open yet", tone: "dim", locked: false, locksAt: null };
      case "awaiting_results":
        return {
          text: cc.afterWeek ? `Opens after Week ${cc.afterWeek} results` : "Opens after results",
          tone: "dim",
          locked: false,
          locksAt: null,
        };
      case "locked":
        return picks
          ? { text: picks, tone: "normal", locked: true, locksAt: null }
          : { text: "Missed your cue", tone: "dim", locked: true, locksAt: null };
      case "open":
        if (home && high) return { text: picks, tone: "normal", locked: false, locksAt: cc.lockAt };
        if (!home && !high) return { text: "Need Home & High picks", tone: "needed", locked: false, locksAt: cc.lockAt };
        return { text: picks, needText: `Need ${home ? "High" : "Home"}`, tone: "normal", locked: false, locksAt: cc.lockAt };
    }
  })();

  const danceCard = ((): LineBody => {
    const text =
      dc.draftStatus === "not_started"
        ? "Draft not started"
        : dc.draftStatus === "in_progress"
          ? "Draft in progress"
          : dc.rosterNames.length
            ? dc.rosterNames.join(", ")
            : "No couples";
    return { text, tone: "normal", locked: dc.draftStatus === "completed", locksAt: null };
  })();

  const grandFinale = ((): LineBody => {
    if (gf.hasPrediction) {
      return {
        text: gf.nextElimName ? `Next elim: ${gf.nextElimName}` : "Prediction in",
        tone: "normal",
        locked: gf.locked,
        locksAt: gf.open ? gf.deadlineAt : null,
      };
    }
    if (gf.locked) return { text: "Missed your cue", tone: "dim", locked: true, locksAt: null };
    return { text: "Need predictions", tone: "needed", locked: false, locksAt: gf.deadlineAt };
  })();

  const bodies: Record<ScoringModuleKey, LineBody & { on: boolean }> = {
    curtainCall: { ...curtainCall, on: cc.on },
    danceCard: { ...danceCard, on: dc.on },
    grandFinale: { ...grandFinale, on: gf.on },
  };
  return SCORING_MODULES.filter((m) => bodies[m.key].on).map((m) => {
    const { text, tone, locked, locksAt, needText } = bodies[m.key];
    return { key: m.key, name: m.name, text, tone, needText: needText ?? null, locked, locksAt };
  });
}

export type PicksAction = "make" | "edit" | "locked" | "none";

// Left button on a league card: Make when something still needs a pick, Edit
// while any pick module is still open, Locked once one has shut and none is open.
export function picksAction(
  picksDue: boolean,
  input: Pick<ModuleStackInput, "curtainCall" | "grandFinale">
): PicksAction {
  if (picksDue) return "make";
  const { curtainCall: cc, grandFinale: gf } = input;
  if ((cc.on && cc.state === "open") || (gf.on && gf.open)) return "edit";
  if ((cc.on && cc.state === "locked") || (gf.on && gf.locked)) return "locked";
  return "none";
}
