# Session Handoff

## 1. Current State

Scoring calibration layer (see plan at the end of this session — search git
history or ask for `/home/node/.claude/plans/scoring-defaults-delightful-charm.md`
if resuming from a fresh machine) is **fully live and verified**. Kylie ran
`scratch/add-scoring-calibration.sql` against the live Supabase project;
`types.ts` has been regenerated from the live schema; `npm run build` /
`npx tsc --noEmit` / `npm run lint` / `npm test` (222/222) are all clean.

A live integration test (`scratch/verify-scoring-calibration.mts`, throwaway
accounts + a throwaway league, cleaned up after) confirmed the SQL-side
pieces Vitest can't cover: `start_draft()` correctly seeds
`judges_score_multiplier` from `dance_card_calibration` keyed by roster size
(verified exact match at roster_size 4 → 1.168, computed from the real
16-couple Season 35 cast ÷ 4 throwaway managers), `judges_score_multiplier_customized`
stays false after `start_draft`'s own write but flips true on a
commissioner's explicit `update_scoring_categories` override, and all 7 new
point-value params round-trip correctly. Not separately verified: the
clamp-to-nearest-defined-roster-size path (only exercised when roster size
falls outside 1-6) — the SQL is simple and was read carefully, but wasn't
run against a real out-of-range case.

**Not yet done**: a manual browser click-through of the Settings form's new
Placement Bonus fields and a live Curtain Call pick (to see the "N pts · M
couples left" preview render) — no browser automation tool in this
container, and the RPC-level integration test above already exercises the
same server-side paths the UI calls into, so this is lower-priority polish,
not a correctness gap.

Also note: competition weeks (Option B — a Week can group multiple TV
episodes) is **already merged to `main`** as of this session (PR #29,
commit `c19eb43`) — earlier revisions of this file described it as still
in-progress on a branch; that's now stale, corrected here.

## 2. Changes Made

### Scoring calibration layer (this session)

Commissioner module weights (Dance Card / Curtain Call / Grand Finale)
previously multiplied never-calibrated raw point values, so a stated weight
didn't deliver proportional influence over standings. Added a calibration
layer underneath the weights — see the full spec and decision trail in the
plan file if it still exists, otherwise this section is the record.

**Decisions made with Kylie** (these override what a spec document might
say, if one still exists and disagrees):
1. Placement bonus (couple finishes top 5) splits into two additive halves —
   one weighted by Dance Card's weight, one by Grand Finale's weight, 50/50
   variance-share, so toggling either module off removes only its own half
   rather than either doing nothing or removing both.
2. 4th/5th place tiers are derived from the existing numeric finale
   position (reusing what Grand Finale's full-order prediction already
   computes) — no new `couples.status` values, no new admin UI.
3. Both Curtain Call sub-mechanics (elimination guess AND top-scorer guess)
   scale with couples remaining, not just elimination calls.
4. Every calibrated value stays commissioner-editable via Settings, same as
   today — calibration only changes *default* values of plain numeric
   columns, never a hidden multiplier layer.
5. Already-drafted leagues are **not** backfilled with the new
   roster-size-calibrated `judges_score_multiplier` — only leagues that
   draft after this ships get it automatically (via `start_draft()`).

**Schema** (`supabase/schema.sql`, delta in `scratch/add-scoring-calibration.sql`,
not yet applied live):
- `scoring_settings`: new columns `fourth_place_points`, `fifth_place_points`,
  `bonus_picks_first_place_points`..`bonus_picks_fifth_place_points`,
  `judges_score_multiplier_customized` (guards `start_draft()`'s auto-write
  from clobbering an intentional pre-draft override). Recalibrated literal
  defaults on `elimination_prediction_points` (30→171), `top_scorer_prediction_points`
  (20→114), `first/second/third_place_points` (150/75/40→106/53/28),
  `bonus_picks_points_per_correct` (50→257) — numbers from the Monte Carlo
  script below, not hand-picked.
- New `dance_card_calibration` table: one row per roster size (1-6),
  read-only reference data, read once by `start_draft()` to seed
  `judges_score_multiplier` the moment roster size is fixed.
- `update_scoring_categories()`: 7 new params (arg count changed 19→26, so
  the live delta **drops** the old-signature function first rather than
  `create or replace`, or Postgres leaves both overloaded).
- `start_draft()`: unchanged signature, new body — looks up the calibrated
  multiplier by roster size (clamped to nearest defined row) and writes it,
  unless the commissioner already customized it.

**Monte Carlo calibration script** (`scripts/monte-carlo-calibration/run.mjs`,
plain Node — no `tsx`/`ts-node` in this repo, deliberately dependency-free):
simulates ~4000 seasons at each roster size, measures Dance Card's own
current spread at roster size 3 as the reference "one full share," solves
Curtain Call/Grand Finale/placement-bonus scales to match it (Grand Finale
capped at 3/5). Already run; output numbers are what's in the schema above.
**Worth knowing**: the roster-size sweep found `judges_score_multiplier`
should *decrease* as roster size grows (2.36 at size 1 → 1.05 at size 6) —
the opposite direction the original spec's prose assumed. This is a real
finite-population-sampling effect (see the script's README for the full
explanation), not a bug. Re-run this script and re-paste its output once
real Season 35 data exists — see its README.

**`src/lib/scoring.ts`**: `computeWeeklyScores` drops the `isFinale` param
(dead once the finale gate moved to per-couple `finalPlacement`), adds
`couplesRemaining`/`totalCouples` params and a new exported
`curtainCallPayout()` helper (also used by the picking UI, so the preview
and the real score can't drift). Podium bonus logic now keyed by numeric
`finalPlacement` (1-5) via two lookup tables instead of by `Outcome` string.

**`src/lib/results.ts`** (`recomputeWeekScores`): now unconditionally
fetches season couples every call (previously only on a resolving week) to
compute `couplesRemaining`/`totalCouples`/`finalPlacementByCouple` — needed
every week now, not just finale weeks. `couplesRemaining` is `totalCouples
minus couples eliminated before this week` (`elimination_week < week.week_number`),
which is correct regardless of whether this call is one of several episodes
sharing a week or a correction re-entering an already-mutated week.

**UI**: `league-modules-form.tsx` gets 4th/5th Dance Card inputs plus a new
"Placement Bonus" sub-section on the Grand Finale card (5 new fields) and a
copy note on Judges' Score Multiplier explaining its auto-calibration.
`pick-em-box.tsx` renders "Correct elimination: N pts · M couples left" /
same for top scorer, using `activeCouples.length` (the same spoiler-safe
count already gating the picker's options) so a spoiler-shy manager never
sees a preview that leaks more than their own picker does.

**Tests**: `src/lib/scoring.test.ts` fully updated (27 tests, all passing) —
new coverage for split placement bonus, 4th/5th tiers, out-of-range
`finalPlacement`, and `curtainCallPayout` scaling. Full suite: 222/222
passing. Lint clean (pre-existing `scratch/*.mts` `prefer-const` issues are
unrelated, not touched this session). `npx tsc --noEmit` / `npm run build`
fail **only** on the expected stale-`types.ts` errors (new `scoring_settings`
columns) — resolves once the SQL is applied live and types regenerate.

## 3. Key Decisions & Lessons Learned

- **This container started 23 commits behind `origin/main`** at the start of
  this session — a large "competition weeks" restructuring (episodes vs.
  fantasy weeks split into two tables) had landed via a separate
  branch/PR since the last local checkout. Always `git fetch && git log
  HEAD..origin/main` before trusting a plan built from a Read of local
  files — a plan drafted against stale code will reference wrong function
  names/line numbers/table shapes. This session's plan was drafted in Plan
  Mode against the *stale* checkout; after exiting plan mode and pulling,
  several assumptions needed re-verification against the real current
  code before implementing (podium-bonus scoring's exact shape held up;
  the scoring-relevant function names/line numbers and the `episode_id`
  vs `week_id` scoping did not, and were re-derived from the pulled code
  before writing anything).
- **Placement bonus vs. "Grand Finale" naming was a real structural
  conflict**, not just terminology: the UI's "Grand Finale" module/weight
  was, before this session, exclusively the full-order elimination-order
  prediction — the 1st/2nd/3rd place bonus fields lived entirely inside
  Dance Card's weight, despite reading like a "Grand Finale" concept.
  Splitting placement bonus into two additive halves (see decisions above)
  was the fix; a naive "just move it to Grand Finale's weight" would have
  silently changed existing leagues' math whenever their Dance Card and
  Grand Finale weights differ.
- **Monte Carlo calibration scripts belong outside `src/`, in plain JS**:
  this repo has no `tsx`/`ts-node`, so a one-time offline script written in
  TypeScript would need extra tooling just to run once. `scripts/monte-carlo-calibration/run.mjs`
  runs with bare `node`, no build step.

## 4. Backlog & Deferred Items

- Manually exercise the Settings form (new placement-bonus fields save/load
  correctly) and a live Curtain Call pick (preview text renders, matches
  what actually gets scored) in the browser — the RPC-level live test
  covers the same server paths, but nobody's actually looked at the
  rendered UI yet.
- Consider re-running the Monte Carlo script against real Season 35 data
  once a season's worth of judge scores / elimination order / manager pick
  accuracy exists — see `scripts/monte-carlo-calibration/README.md`.
- The `dance_card_calibration` clamp-to-nearest-roster-size path (only
  exercised when a league's roster size falls outside the swept 1-6 range)
  wasn't run live — worth a quick check if a very-few-managers league shows
  up against this season's 16-couple cast (roster_size could reach 8).
- DND / "—" live check still owed (carried over from before this session,
  unrelated to scoring work).
- Actually deleting `auth.users` / profiles / league history — still no
  safe automatic path (carried over, unrelated).

## 5. Next Steps

Nothing blocking. When resuming:
1. If picking up the browser QA pass, no schema/type work is needed first —
   everything's live and verified server-side already.
2. Otherwise, wait for the next feature request or bug report.
