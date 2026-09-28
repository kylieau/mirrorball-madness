import { formatCoupleName } from "./couple-display";
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
  // One string per visual row under the module name. Curtain Call Home/High
  // and Dance Card couples are never joined onto a single row.
  lines: string[];
  tone: "needed" | "normal" | "dim";
  // A gold "Need …" tacked onto an otherwise normal line.
  needText: string | null;
  locked: boolean;
  locksAt: string | null;
};

type LineBody = Pick<ModuleLine, "lines" | "tone" | "locked" | "locksAt"> & { needText?: string };

// Dance Card triage rows name both partners in full. First-name display
// labels collide (and read as a truncated roster) once each couple has its own line.
export function danceCardRosterNames(
  coupleIds: readonly string[],
  couples: readonly { id: string; celebrityName: string; proName: string }[]
): string[] {
  const label = new Map(
    couples.map((c) => [c.id, formatCoupleName({ celebrity: c.celebrityName, pro: c.proName })])
  );
  return coupleIds.flatMap((id) => {
    const name = label.get(id);
    return name ? [name] : [];
  });
}

// One entry per module that's on, in the canonical module order.
export function buildModuleStack(input: ModuleStackInput): ModuleLine[] {
  const { curtainCall: cc, danceCard: dc, grandFinale: gf } = input;

  const curtainCall = ((): LineBody => {
    const home = cc.eliminatedName && `Home: ${cc.eliminatedName}`;
    const high = cc.topScorerName && `High: ${cc.topScorerName}`;
    const picks = [home, high].filter((line): line is string => !!line);
    switch (cc.state) {
      case "no_week":
        return { lines: ["Not open yet"], tone: "dim", locked: false, locksAt: null };
      case "awaiting_results":
        return {
          lines: [cc.afterWeek ? `Opens after Week ${cc.afterWeek} results` : "Opens after results"],
          tone: "dim",
          locked: false,
          locksAt: null,
        };
      case "locked":
        return picks.length
          ? { lines: picks, tone: "normal", locked: true, locksAt: null }
          : { lines: ["Missed your cue"], tone: "dim", locked: true, locksAt: null };
      case "open":
        if (home && high) return { lines: picks, tone: "normal", locked: false, locksAt: cc.lockAt };
        if (!home && !high) return { lines: ["Need Home & High picks"], tone: "needed", locked: false, locksAt: cc.lockAt };
        return { lines: picks, needText: `Need ${home ? "High" : "Home"}`, tone: "normal", locked: false, locksAt: cc.lockAt };
    }
  })();

  const danceCard = ((): LineBody => {
    const lines =
      dc.draftStatus === "not_started"
        ? ["Draft not started"]
        : dc.draftStatus === "in_progress"
          ? ["Draft in progress"]
          : dc.rosterNames.length
            ? dc.rosterNames
            : ["No couples"];
    return { lines, tone: "normal", locked: dc.draftStatus === "completed", locksAt: null };
  })();

  const grandFinale = ((): LineBody => {
    if (gf.hasPrediction) {
      return {
        lines: [gf.nextElimName ? `Next elim: ${gf.nextElimName}` : "Prediction in"],
        tone: "normal",
        locked: gf.locked,
        locksAt: gf.open ? gf.deadlineAt : null,
      };
    }
    if (gf.locked) return { lines: ["Missed your cue"], tone: "dim", locked: true, locksAt: null };
    return { lines: ["Need predictions"], tone: "needed", locked: false, locksAt: gf.deadlineAt };
  })();

  const bodies: Record<ScoringModuleKey, LineBody & { on: boolean }> = {
    curtainCall: { ...curtainCall, on: cc.on },
    danceCard: { ...danceCard, on: dc.on },
    grandFinale: { ...grandFinale, on: gf.on },
  };
  return SCORING_MODULES.filter((m) => bodies[m.key].on).map((m) => {
    const { lines, tone, locked, locksAt, needText } = bodies[m.key];
    return { key: m.key, name: m.name, lines, tone, needText: needText ?? null, locked, locksAt };
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
