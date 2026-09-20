// One-time offline Monte Carlo calibration for the scoring normalization
// layer (see /home/node/.claude/plans/scoring-defaults-delightful-charm.md
// and the "Scoring defaults — neutral baseline spec" it was scoped from).
//
// Not runtime code — this never gets imported by the app. It produces the
// literal default numbers that get pasted into supabase/schema.sql (the
// scoring_settings column defaults and the dance_card_calibration seed
// rows). Re-run this against real Season 35 data once available (see
// README.md in this directory) and re-paste the output.
//
// Run with: node scripts/monte-carlo-calibration/run.mjs
//
// ============================================================
// Design, in one paragraph
// ============================================================
// Simulate several thousand plausible seasons. At the league's default
// roster size (3, matching leagues.roster_size's table default), measure
// how much standings-deciding spread (variance across managers) Dance Card
// produces today, at today's shipped point values (judges_score_multiplier
// = 1, survival = 15, placement 1st-3rd = 150/75/40). That measured spread
// becomes TARGET — "one full share" of standings influence. Curtain Call
// and Grand Finale's point values get solved so each produces the same
// TARGET (Grand Finale capped at 3/5 of it, per spec item 6). Dance Card's
// multiplier gets re-solved per roster size so it keeps hitting TARGET even
// as roster size changes (bigger rosters average out judge-score luck, so
// a bigger multiplier is needed to restore the same spread) — this is the
// one genuinely roster-size-keyed constant; everything else here is a
// single global number, solved once at roster size 3.
//
// ============================================================
// Script parameters (free choices, not derived — tune and re-run as needed)
// ============================================================
const TOTAL_COUPLES = 12; // typical DWTS cast size
const ROSTER_SIZES = [1, 2, 3, 4, 5, 6]; // couples per manager, sweep for dance_card_calibration
const REFERENCE_ROSTER_SIZE = 3; // matches leagues.roster_size's table default — where Curtain Call/Grand Finale get solved
const SEASONS_PER_CONFIG = 4000;

const SKILL_SD = 1; // spread of each couple's persistent latent skill
const JUDGE_SCORE_BASE = 24;
const JUDGE_SCORE_SKILL_COEF = 4; // how much skill moves a couple's weekly judge score
const JUDGE_SCORE_NOISE_SD = 2; // week-to-week judging noise
const ELIM_NOISE_SD = 1.5; // "America's vote" unpredictability layered on top of skill when deciding who goes home
const FINALE_NOISE_SD = 1; // same idea, among the final 3

// How good managers are at Curtain Call's weekly picks — better than random,
// not perfect. p_hit is the chance a manager identifies the actual most-
// endangered/highest-scoring couple; otherwise they guess uniformly among
// the rest of that week's active couples.
const ELIM_GUESS_HIT_RATE = 0.35;
const TOPSCORER_GUESS_HIT_RATE = 0.4;

// Grand Finale full-order prediction: each manager's guessed order is the
// true skill-rank order with this much random reshuffling noise mixed in.
const GF_ORDER_NOISE_SD = 3;

// Today's shipped defaults — the "raw" baseline this script measures
// against, and what a couple's placement bonus is computed with pre-
// calibration (4th/5th are new tiers this feature adds; picked to continue
// the existing 150/75/40 decay pattern, not derived).
const CURRENT = {
  survivalPoints: 15,
  eliminationPredictionPoints: 30,
  topScorerPredictionPoints: 20,
  placementShape: [150, 75, 40, 20, 10], // index 0 = 1st place ... index 4 = 5th place
  bonusPicksPointsPerCorrect: 50,
};

const GRAND_FINALE_CAP_FRACTION = 0.6; // spec item 6: 3/5 of a full equal share

// ============================================================
// RNG (seeded, for reproducibility)
// ============================================================
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260918);
function gaussian() {
  // Box-Muller
  const u1 = Math.max(rand(), 1e-9);
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function variance(xs) {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
}

// ============================================================
// One simulated season: elimination order, finale placement, and every
// manager's raw (unscaled, today's-default-valued) component totals.
// ============================================================
function simulateSeason(rosterSize) {
  const managerCount = Math.max(2, Math.floor(TOTAL_COUPLES / rosterSize));
  const skills = Array.from({ length: TOTAL_COUPLES }, () => gaussian() * SKILL_SD);
  const coupleIds = skills.map((_, i) => i);

  // Draft: random assignment, roster_size couples to each of managerCount
  // managers, remainder undrafted — mirrors start_draft's integer division.
  const drafted = shuffle(coupleIds).slice(0, rosterSize * managerCount);
  const rosterOf = new Map(); // coupleId -> managerId
  for (let m = 0; m < managerCount; m++) {
    for (let s = 0; s < rosterSize; s++) {
      rosterOf.set(drafted[m * rosterSize + s], m);
    }
  }

  let active = new Set(coupleIds);
  const eliminationWeekOf = new Map();
  const totalEliminationWeeks = TOTAL_COUPLES - 3;

  const judgeScoreSumByManager = new Array(managerCount).fill(0);
  const survivalByManager = new Array(managerCount).fill(0);
  const predictionByManager = new Array(managerCount).fill(0);

  for (let week = 1; week <= totalEliminationWeeks; week++) {
    const activeIds = [...active];
    const weekScoreOf = new Map(
      activeIds.map((id) => [
        id,
        JUDGE_SCORE_BASE + JUDGE_SCORE_SKILL_COEF * skills[id] + gaussian() * JUDGE_SCORE_NOISE_SD,
      ])
    );

    for (const id of activeIds) {
      const m = rosterOf.get(id);
      if (m === undefined) continue;
      judgeScoreSumByManager[m] += weekScoreOf.get(id);
      survivalByManager[m] += CURRENT.survivalPoints; // still active this week => survives
    }

    // Who actually goes home: highest "danger" (low skill + bad luck).
    let worst = activeIds[0];
    let worstDanger = -Infinity;
    for (const id of activeIds) {
      const danger = -skills[id] + gaussian() * ELIM_NOISE_SD;
      if (danger > worstDanger) {
        worstDanger = danger;
        worst = id;
      }
    }

    // Manager guesses: the "obviously endangered" couple (lowest skill among
    // active) is correctly identified ELIM_GUESS_HIT_RATE of the time.
    const mostObviouslyEndangered = activeIds.reduce((a, b) => (skills[a] < skills[b] ? a : b));
    const trueTopScorer = activeIds.reduce((a, b) => (weekScoreOf.get(a) > weekScoreOf.get(b) ? a : b));

    for (let m = 0; m < managerCount; m++) {
      const elimGuess =
        rand() < ELIM_GUESS_HIT_RATE ? mostObviouslyEndangered : activeIds[Math.floor(rand() * activeIds.length)];
      if (elimGuess === worst) predictionByManager[m] += CURRENT.eliminationPredictionPoints;

      const topGuess =
        rand() < TOPSCORER_GUESS_HIT_RATE ? trueTopScorer : activeIds[Math.floor(rand() * activeIds.length)];
      if (topGuess === trueTopScorer) predictionByManager[m] += CURRENT.topScorerPredictionPoints;
    }

    active.delete(worst);
    eliminationWeekOf.set(worst, week);
  }

  // Finale: rank the remaining 3 by skill + noise.
  const finalists = [...active];
  const finaleScored = finalists
    .map((id) => ({ id, s: skills[id] + gaussian() * FINALE_NOISE_SD }))
    .sort((a, b) => b.s - a.s);
  // Also give the finale-week judge score + survival, like every other week.
  const weekScoreOf = new Map(
    finalists.map((id) => [
      id,
      JUDGE_SCORE_BASE + JUDGE_SCORE_SKILL_COEF * skills[id] + gaussian() * JUDGE_SCORE_NOISE_SD,
    ])
  );
  for (const id of finalists) {
    const m = rosterOf.get(id);
    if (m === undefined) continue;
    judgeScoreSumByManager[m] += weekScoreOf.get(id);
    survivalByManager[m] += CURRENT.survivalPoints;
  }

  // finalPlacement: 1 = winner ... totalEliminationWeeks+3 = first eliminated.
  // Mirrors results.ts's actualPositionByCouple -> finalPlacement mapping.
  const finalPlacementOf = new Map();
  finaleScored.forEach(({ id }, i) => finalPlacementOf.set(id, i + 1)); // 1,2,3
  for (const [id, week] of eliminationWeekOf) {
    finalPlacementOf.set(id, totalEliminationWeeks - week + 1 + 3);
  }

  // Grand Finale full-order prediction: guessed order = skill rank + noise.
  const trueSkillRank = [...coupleIds].sort((a, b) => skills[b] - skills[a]); // best skill first
  const bonusPicksByManager = new Array(managerCount).fill(0);
  const gfPlacementByManager = new Array(managerCount).fill(0);
  const danceCardPlacementByManager = new Array(managerCount).fill(0);

  for (let m = 0; m < managerCount; m++) {
    const guessedOrder = trueSkillRank
      .map((id) => ({ id, key: gaussian() * GF_ORDER_NOISE_SD + trueSkillRank.indexOf(id) }))
      .sort((a, b) => a.key - b.key)
      .map((x) => x.id);
    // predictedPosition: 1 = first eliminated ... TOTAL_COUPLES = winner
    // (matches computeGrandFinalePoints' actualPosition convention).
    const predictedPositionOf = new Map(guessedOrder.map((id, i) => [id, i + 1]));

    for (const [id, placement] of finalPlacementOf) {
      const actualPosition = TOTAL_COUPLES - placement + 1;
      if (predictedPositionOf.get(id) === actualPosition) {
        bonusPicksByManager[m] += CURRENT.bonusPicksPointsPerCorrect;
      }
    }

    for (const [id, placement] of finalPlacementOf) {
      if (placement > 5) continue;
      const owner = rosterOf.get(id);
      if (owner !== m) continue;
      danceCardPlacementByManager[m] += CURRENT.placementShape[placement - 1];
      gfPlacementByManager[m] += CURRENT.placementShape[placement - 1]; // same raw shape pre-calibration
    }
  }

  return {
    managerCount,
    judgeScoreSumByManager,
    survivalByManager,
    predictionByManager,
    bonusPicksByManager,
    gfPlacementByManager,
    danceCardPlacementByManager,
  };
}

function simulateMany(rosterSize, n) {
  const acc = {
    judgeScoreSum: [],
    survival: [],
    prediction: [],
    bonusPicks: [],
    gfPlacement: [],
    danceCardPlacement: [],
  };
  for (let i = 0; i < n; i++) {
    const s = simulateSeason(rosterSize);
    for (let m = 0; m < s.managerCount; m++) {
      acc.judgeScoreSum.push(s.judgeScoreSumByManager[m]);
      acc.survival.push(s.survivalByManager[m]);
      acc.prediction.push(s.predictionByManager[m]);
      acc.bonusPicks.push(s.bonusPicksByManager[m]);
      acc.gfPlacement.push(s.gfPlacementByManager[m]);
      acc.danceCardPlacement.push(s.danceCardPlacementByManager[m]);
    }
  }
  return acc;
}

function sumArrays(...arrs) {
  return arrs[0].map((_, i) => arrs.reduce((total, a) => total + a[i], 0));
}

// Bisect for a scalar m (over judgeScoreSum) such that
// Var(m*judgeScoreSum + fixedComponent) hits targetVar. Variance is
// monotonically increasing in m for m > 0 here, so plain bisection works.
function solveMultiplierForTarget(judgeScoreSum, fixedComponent, targetVar) {
  let lo = 0,
    hi = 20;
  for (let iter = 0; iter < 60; iter++) {
    const mid = (lo + hi) / 2;
    const combined = judgeScoreSum.map((v, i) => v * mid + fixedComponent[i]);
    if (variance(combined) < targetVar) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ============================================================
// Reference run: roster size 3, where Curtain Call / Grand Finale / the
// Dance-Card-half vs Grand-Finale-half placement split all get solved once.
// ============================================================
console.log(`Simulating ${SEASONS_PER_CONFIG} seasons at roster size ${REFERENCE_ROSTER_SIZE} (reference)...`);
const ref = simulateMany(REFERENCE_ROSTER_SIZE, SEASONS_PER_CONFIG);

const danceCardTotalRaw = sumArrays(ref.judgeScoreSum, ref.survival, ref.danceCardPlacement);
const TARGET = variance(danceCardTotalRaw);
console.log(`TARGET (Dance Card's own current spread at roster size ${REFERENCE_ROSTER_SIZE}): ${TARGET.toFixed(1)}`);

const V_dcPlacementRaw = variance(ref.danceCardPlacement);
const fPlacementDC = V_dcPlacementRaw / TARGET;
const P = fPlacementDC * TARGET; // total placement-bonus variance-worth, split 50/50 across modules
console.log(
  `Placement bonus is currently ${(fPlacementDC * 100).toFixed(1)}% of Dance Card's spread (P=${P.toFixed(1)}) — split 50/50 across Dance Card / Grand Finale per decision.`
);

// Dance-Card-half placement: isolated scale (closed form, since it's not
// combined with anything else being solved).
const danceCardHalfPlacementScale = Math.sqrt((0.5 * P) / V_dcPlacementRaw);

// Judges' score multiplier at the reference roster size: whatever's left of
// Dance Card's target budget after carving out its placement half.
const remainingDanceCardTarget = TARGET - 0.5 * P;
const referenceMultiplier = solveMultiplierForTarget(ref.judgeScoreSum, ref.survival, remainingDanceCardTarget);

// Curtain Call: single global scale, isolated (preserves 30:20 ratio).
const V_curtainCallRaw = variance(ref.prediction);
const curtainCallScale = Math.sqrt(TARGET / V_curtainCallRaw);

// Grand Finale: 3/5 of TARGET, split between the full-order pick and its
// placement half (which reuses the other 0.5*P from above).
const grandFinaleBudget = GRAND_FINALE_CAP_FRACTION * TARGET;
const gfPlacementBudget = 0.5 * P;
const bonusPicksBudget = grandFinaleBudget - gfPlacementBudget;
const V_bonusPicksRaw = variance(ref.bonusPicks);
const V_gfPlacementRaw = variance(ref.gfPlacement);
const bonusPicksScale = Math.sqrt(bonusPicksBudget / V_bonusPicksRaw);
const gfPlacementScale = Math.sqrt(gfPlacementBudget / V_gfPlacementRaw);

console.log("\n--- Global (roster-size-independent) calibrated defaults ---");
const survivalPoints = CURRENT.survivalPoints; // unscaled by design
const eliminationPredictionPoints = CURRENT.eliminationPredictionPoints * curtainCallScale;
const topScorerPredictionPoints = CURRENT.topScorerPredictionPoints * curtainCallScale;
const dcPlacement = CURRENT.placementShape.map((v) => v * danceCardHalfPlacementScale);
const gfPlacement = CURRENT.placementShape.map((v) => v * gfPlacementScale);
const bonusPicksPointsPerCorrect = CURRENT.bonusPicksPointsPerCorrect * bonusPicksScale;

console.log(`survival_points: ${survivalPoints} (unchanged)`);
console.log(`elimination_prediction_points: ${eliminationPredictionPoints.toFixed(1)}`);
console.log(`top_scorer_prediction_points: ${topScorerPredictionPoints.toFixed(1)}`);
console.log(
  `first_place_points .. fifth_place_points (Dance Card half): ${dcPlacement.map((v) => v.toFixed(1)).join(", ")}`
);
console.log(
  `bonus_picks_first_place_points .. bonus_picks_fifth_place_points (Grand Finale half): ${gfPlacement.map((v) => v.toFixed(1)).join(", ")}`
);
console.log(`bonus_picks_points_per_correct: ${bonusPicksPointsPerCorrect.toFixed(1)}`);
console.log(`judges_score_multiplier at roster size ${REFERENCE_ROSTER_SIZE}: ${referenceMultiplier.toFixed(3)}`);

// ============================================================
// Roster-size sweep: solve judges_score_multiplier at every roster size,
// holding the survival/placement components (already fixed above) and the
// same remainingDanceCardTarget as the thing to hit.
// ============================================================
console.log(`\n--- dance_card_calibration (roster_size -> judges_score_multiplier_default) ---`);
const calibrationRows = [];
for (const rosterSize of ROSTER_SIZES) {
  const sim =
    rosterSize === REFERENCE_ROSTER_SIZE ? ref : simulateMany(rosterSize, SEASONS_PER_CONFIG);
  const m = solveMultiplierForTarget(sim.judgeScoreSum, sim.survival, remainingDanceCardTarget);
  calibrationRows.push({ rosterSize, multiplier: m });
  console.log(`roster_size ${rosterSize}: ${m.toFixed(3)}`);
}

console.log("\n--- SQL to paste ---\n");
console.log(
  `insert into public.dance_card_calibration (roster_size, judges_score_multiplier_default) values\n` +
    calibrationRows.map((r) => `  (${r.rosterSize}, ${r.multiplier.toFixed(3)})`).join(",\n") +
    ";"
);
