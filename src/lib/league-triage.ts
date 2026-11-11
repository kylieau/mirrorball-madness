import { buildCoupleDisplayNames, type CoupleNameParts } from "./couple-display";
import { formatCountdown } from "./format-countdown";
import { SCORING_MODULES, type ScoringModuleKey } from "./scoring-modules";

export function leagueTapHref(leagueId: string, picksDue: boolean): string {
  return `/leagues/${leagueId}/${picksDue ? "picks" : "standings"}`;
}

// open = picks can be made; awaiting_results = the previous week isn't published yet;
// no_week = no live week at all (pre-premiere or off-season).
export type CurtainCallState = "open" | "locked" | "awaiting_results" | "no_week";

// A couple as the card names it, with its id so the name opens its page.
export type StackCouple = CoupleNameParts & { id: string };

export type ModuleStackInput = {
  curtainCall: {
    on: boolean;
    state: CurtainCallState;
    afterWeek: number | null;
    lockAt: string | null;
    eliminatedName: StackCouple | null;
    // The Finale week only, where the podium replaces the elimination pick:
    // Winner, Runner-Up, Third Place, or empty until all three are saved.
    podiumNames: StackCouple[] | null;
    topScorerName: StackCouple | null;
  };
  danceCard: { on: boolean; draftStatus: string; roster: RosterCouple[]; moves: RosterMoves<StackCouple> };
  grandFinale: {
    on: boolean;
    open: boolean;
    locked: boolean;
    deadlineAt: string | null;
    hasPrediction: boolean;
    nextElimName: StackCouple | null;
  };
};

// A Dance Card couple and whether it is out of the competition (eliminated
// or withdrawn) as far as the viewer has watched.
export type RosterCouple = { couple: StackCouple; out: boolean };

// The viewer's Lifeline, waiver list and trades still in play, which the card
// lists under their Dance Card couples. A part is null when the league
// doesn't have it on, the viewer has nothing in it, or it couldn't be read,
// and all three are for a viewer who is behind, since an open spot says a
// couple went home.
export type RosterMoves<Couple> = {
  // One entry per dead roster spot this week: the Lifeline saved for it.
  lifeline: { picks: (Couple | null)[]; lockAt: string | null; locked: boolean } | null;
  // The couples the saved list would add, highest claim first. dueAt is null
  // until the run's week has its results posted.
  waivers: { adds: Couple[]; openSpotCount: number; dueAt: string | null } | null;
  // Offers still waiting on the viewer's answer, and who each accepted trade
  // waiting on the waiver run is with.
  trades: { offerExpiries: string[]; acceptedWith: string[][] } | null;
};

export const NO_ROSTER_MOVES: RosterMoves<never> = { lifeline: null, waivers: null, trades: null };

// A Lifeline locks and costs points like a pick, so a missing one counts as
// Picks Due. An open spot or a trade offer doesn't.
export function lifelinePickDue(moves: RosterMoves<unknown>): boolean {
  return !!moves.lifeline && !moves.lifeline.locked && moves.lifeline.picks.some((pick) => !pick);
}

// One visual row: plain text, then a couple the card renders as
// "Tatyana & Jan" with the celebrity in bold ("Home: " + couple). Rows
// without a couple have couple null. A struck row is a couple that is out.
export type StackRow = { text: string; couple: StackCouple | null; struck?: boolean };

const plain = (text: string): StackRow => ({ text, couple: null });
const named = (text: string, couple: StackCouple): StackRow => ({ text, couple });

// A roster move under the Dance Card couples: something the viewer still has
// to do (needed), a saved Lifeline (saved), a claim or trade waiting on the
// waiver run (waiting), or a dead spot that locked without a Lifeline
// (missed). `after` follows the couple; `clock` is the right-hand note.
export type MoveRow = StackRow & {
  mark: "needed" | "saved" | "waiting" | "missed";
  after?: string;
  clock: string | null;
};

type MoveBody = Omit<MoveRow, "clock">;

const plural = (count: number, noun: string) => (count === 1 ? noun : `${noun}s`);

// Each mechanism's clock sits on its first line only.
const clocked = (rows: MoveBody[], clock: string | null): MoveRow[] =>
  rows.map((row, index) => ({ ...row, clock: index === 0 ? clock : null }));

// A move's clock keeps only its largest unit ("Locks in 5h"), so the line
// beside it has room on a narrow phone.
function clockUntil(verb: string, iso: string, now: Date, passed: string): string {
  const left = formatCountdown(iso, now);
  if (left === "locked") return passed;
  return `${verb} in ${left === "under a minute" ? "1m" : left.split(" ")[0]}`;
}

function rosterMoveRows({ lifeline, waivers, trades }: RosterMoves<StackCouple>, now: Date): MoveRow[] {
  const rows: MoveRow[] = [];

  if (lifeline) {
    const missing = lifeline.picks.filter((pick) => !pick).length;
    const missingRow: MoveBody[] =
      missing === 0
        ? []
        : lifeline.locked
          ? [{ ...plain(`No ${plural(missing, "Lifeline pick")}`), mark: "missed" }]
          : [{ ...plain(missing === 1 ? "Need Lifeline pick" : `Need ${missing} Lifeline picks`), mark: "needed" }];
    const saved = lifeline.picks.flatMap((pick): MoveBody[] =>
      pick ? [{ ...named("Lifeline: ", pick), mark: "saved" }] : []
    );
    rows.push(
      ...clocked(
        [...missingRow, ...saved],
        lifeline.locked ? "Locked" : lifeline.lockAt ? clockUntil("Locks", lifeline.lockAt, now, "Locked") : null
      )
    );
  }

  if (waivers) {
    const [top, ...rest] = waivers.adds;
    const row: MoveBody[] = top
      ? [{ ...named("Add ", top), after: rest.length ? `, +${rest.length} more` : undefined, mark: "waiting" }]
      : waivers.openSpotCount > 0
        ? [{ ...plain(`${waivers.openSpotCount} ${plural(waivers.openSpotCount, "open spot")}`), mark: "needed" }]
        : [];
    rows.push(
      ...clocked(
        row,
        waivers.dueAt == null ? "After results" : clockUntil("Runs", waivers.dueAt, now, "Runs soon")
      )
    );
  }

  if (trades) {
    const firstExpiry = [...trades.offerExpiries].sort()[0];
    if (firstExpiry) {
      rows.push({
        ...plain(`${trades.offerExpiries.length} ${plural(trades.offerExpiries.length, "trade offer")}`),
        mark: "needed",
        clock: clockUntil("Ends", firstExpiry, now, "Ends soon"),
      });
    }
    rows.push(
      ...trades.acceptedWith.map(
        (names): MoveRow => ({
          ...plain(`Trade with ${names.length > 2 ? `${names.length} managers` : names.join(" and ")}`),
          mark: "waiting",
          clock: "At the run",
        })
      )
    );
  }

  return rows;
}

export type ModuleLine = {
  key: ScoringModuleKey;
  name: string;
  // One row per visual line under the module name. Curtain Call's picks
  // (Home/High, or Win/2nd/3rd/High in the Finale) and Dance Card couples
  // are never joined onto a single row.
  lines: StackRow[];
  // Dance Card only: the viewer's roster moves, under their couples.
  moves: MoveRow[];
  tone: "needed" | "normal" | "dim";
  // A gold "Need …" tacked onto an otherwise normal line.
  needText: string | null;
  locked: boolean;
  locksAt: string | null;
};

const PODIUM_ROW_LABELS = ["Win: ", "2nd: ", "3rd: "];

type LineBody = Pick<ModuleLine, "lines" | "tone" | "locked" | "locksAt"> & { needText?: string; moves?: MoveRow[] };

// First names for both partners, via the same display helper the rest of the
// app uses — last initial only when that helper finds a collision in this pool.
export function danceCardRosterNames(
  coupleIds: readonly string[],
  couples: readonly { id: string; celebrityName: string; proName: string; out: boolean }[]
): RosterCouple[] {
  const display = buildCoupleDisplayNames(
    couples.map((c) => ({ id: c.id, celebrity_name: c.celebrityName, pro_name: c.proName }))
  );
  const outIds = new Set(couples.filter((c) => c.out).map((c) => c.id));
  return coupleIds.flatMap((id) => {
    const parts = display.get(id);
    return parts ? [{ couple: { ...parts, id }, out: outIds.has(id) }] : [];
  });
}

// One entry per module that's on, in the canonical module order.
export function buildModuleStack(input: ModuleStackInput, now: Date = new Date()): ModuleLine[] {
  const { curtainCall: cc, danceCard: dc, grandFinale: gf } = input;

  const curtainCall = ((): LineBody => {
    const homeWord = cc.podiumNames ? "podium" : "Home";
    const home = cc.podiumNames
      ? cc.podiumNames.map((couple, index) => named(PODIUM_ROW_LABELS[index], couple))
      : cc.eliminatedName
        ? [named("Home: ", cc.eliminatedName)]
        : [];
    const high = cc.topScorerName ? [named("High: ", cc.topScorerName)] : [];
    const picks = [...home, ...high];
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
        if (home.length && high.length) return { lines: picks, tone: "normal", locked: false, locksAt: cc.lockAt };
        if (!picks.length) {
          return { lines: [plain(`Need ${homeWord} & High picks`)], tone: "needed", locked: false, locksAt: cc.lockAt };
        }
        return {
          lines: picks,
          needText: `Need ${home.length ? "High" : homeWord}`,
          tone: "normal",
          locked: false,
          locksAt: cc.lockAt,
        };
    }
  })();

  const danceCard = ((): LineBody => {
    const lines =
      dc.draftStatus === "not_started"
        ? [plain("Draft not started")]
        : dc.draftStatus === "in_progress"
          ? [plain("Draft in progress")]
          : dc.roster.length
            ? dc.roster.map(({ couple, out }) => ({ ...named("", couple), struck: out }))
            : [plain("No couples")];
    return {
      lines,
      moves: dc.draftStatus === "completed" ? rosterMoveRows(dc.moves, now) : [],
      tone: "normal",
      locked: dc.draftStatus === "completed",
      locksAt: null,
    };
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
    const { lines, moves, tone, locked, locksAt, needText } = bodies[m.key];
    return { key: m.key, name: m.name, lines, moves: moves ?? [], tone, needText: needText ?? null, locked, locksAt };
  });
}

export type PicksAction = "make" | "edit" | "locked" | "none";

// Locked picks remain viewable from the league card.
export function picksButtonLabel(action: PicksAction): "Make Picks" | "Edit Picks" | "See Picks" | null {
  if (action === "make") return "Make Picks";
  if (action === "locked") return "See Picks";
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
