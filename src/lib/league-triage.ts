import { buildCoupleDisplayNames, type CoupleNameParts } from "./couple-display";
import { SCORING_MODULES, type ScoringModuleKey } from "./scoring-modules";

export function leagueTapHref(leagueId: string, picksDue: boolean): string {
  return `/leagues/${leagueId}/${picksDue ? "picks" : "standings"}`;
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
    eliminatedName: CoupleNameParts | null;
    topScorerName: CoupleNameParts | null;
  };
  danceCard: { on: boolean; draftStatus: string; rosterNames: CoupleNameParts[] };
  grandFinale: {
    on: boolean;
    open: boolean;
    locked: boolean;
    deadlineAt: string | null;
    hasPrediction: boolean;
    nextElimName: CoupleNameParts | null;
  };
};

// One visual row: plain text, then a couple the card renders as
// "Tatyana & Jan" with the celebrity in bold ("Home: " + couple). Rows
// without a couple have couple null.
export type StackRow = { text: string; couple: CoupleNameParts | null };

const plain = (text: string): StackRow => ({ text, couple: null });
const named = (text: string, couple: CoupleNameParts): StackRow => ({ text, couple });

export type ModuleLine = {
  key: ScoringModuleKey;
  name: string;
  // One row per visual line under the module name. Curtain Call Home/High
  // and Dance Card couples are never joined onto a single row.
  lines: StackRow[];
  tone: "needed" | "normal" | "dim";
  // A gold "Need …" tacked onto an otherwise normal line.
  needText: string | null;
  locked: boolean;
  locksAt: string | null;
};

type LineBody = Pick<ModuleLine, "lines" | "tone" | "locked" | "locksAt"> & { needText?: string };

// First names for both partners, via the same display helper the rest of the
// app uses — last initial only when that helper finds a collision in this pool.
export function danceCardRosterNames(
  coupleIds: readonly string[],
  couples: readonly { id: string; celebrityName: string; proName: string }[]
): CoupleNameParts[] {
  const display = buildCoupleDisplayNames(
    couples.map((c) => ({ id: c.id, celebrity_name: c.celebrityName, pro_name: c.proName }))
  );
  return coupleIds.flatMap((id) => {
    const parts = display.get(id);
    return parts ? [parts] : [];
  });
}

// One entry per module that's on, in the canonical module order.
export function buildModuleStack(input: ModuleStackInput): ModuleLine[] {
  const { curtainCall: cc, danceCard: dc, grandFinale: gf } = input;

  const curtainCall = ((): LineBody => {
    const home = cc.eliminatedName ? named("Home: ", cc.eliminatedName) : null;
    const high = cc.topScorerName ? named("High: ", cc.topScorerName) : null;
    const picks = [home, high].filter((row): row is StackRow => !!row);
    switch (cc.state) {
      case "no_week":
        return { lines: [plain("Not open yet")], tone: "dim", locked: false, locksAt: null };
      case "awaiting_results":
        return {
          lines: [plain(cc.afterWeek ? `Opens after Week ${cc.afterWeek} results` : "Opens after results")],
          tone: "dim",
          locked: false,
          locksAt: null,
        };
      case "locked":
        return picks.length
          ? { lines: picks, tone: "normal", locked: true, locksAt: null }
          : { lines: [plain("Missed your cue")], tone: "dim", locked: true, locksAt: null };
      case "open":
        if (home && high) return { lines: picks, tone: "normal", locked: false, locksAt: cc.lockAt };
        if (!home && !high) return { lines: [plain("Need Home & High picks")], tone: "needed", locked: false, locksAt: cc.lockAt };
        return { lines: picks, needText: `Need ${home ? "High" : "Home"}`, tone: "normal", locked: false, locksAt: cc.lockAt };
    }
  })();

  const danceCard = ((): LineBody => {
    const lines =
      dc.draftStatus === "not_started"
        ? [plain("Draft not started")]
        : dc.draftStatus === "in_progress"
          ? [plain("Draft in progress")]
          : dc.rosterNames.length
            ? dc.rosterNames.map((couple) => named("", couple))
            : [plain("No couples")];
    return { lines, tone: "normal", locked: dc.draftStatus === "completed", locksAt: null };
  })();

  const grandFinale = ((): LineBody => {
    if (gf.hasPrediction) {
      return {
        lines: [gf.nextElimName ? named("Next elim: ", gf.nextElimName) : plain("Prediction in")],
        tone: "normal",
        locked: gf.locked,
        locksAt: gf.open ? gf.deadlineAt : null,
      };
    }
    if (gf.locked) return { lines: [plain("Missed your cue")], tone: "dim", locked: true, locksAt: null };
    return { lines: [plain("Need predictions")], tone: "needed", locked: false, locksAt: gf.deadlineAt };
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

// Locked keeps the Make Picks label and renders muted, so a caught-up card
// doesn't grow a second "Picks Locked" label.
export function picksButtonLabel(action: PicksAction): "Make Picks" | "Edit Picks" | null {
  if (action === "make" || action === "locked") return "Make Picks";
  if (action === "edit") return "Edit Picks";
  return null;
}

// Caught-up cards omit the status pill. A viewer who is behind still needs
// the weeks-behind pill, and a due card still needs Picks Due.
export function showHybridStatusPill(picksDue: boolean, weeksBehind: number): boolean {
  return picksDue || weeksBehind > 0;
}

// Home section chrome from the hybrid decision table (2026-09-28). One league
// keeps create/join quiet under the card. Two or more get Manage › for
// housekeeping; triage itself stays on the cards.
export function homeLeagueChrome(leagueCount: number): { showManage: boolean; quietCreateJoin: boolean } {
  return { showManage: leagueCount >= 2, quietCreateJoin: leagueCount === 1 };
}

// Left button: Make when something still needs a pick, Edit while any pick
// module is still open, Locked once one has shut and none is open.
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
