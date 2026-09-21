# Session Handoff

## 1. Current State

**Home episode banner — implemented, uncommitted on `main`.** Adds a compact
theatrical "Week N" banner (picks-open / on-air status, season-progress dots)
at the top of `/today` that collapses into a slim sticky bar on scroll; the
per-league `DeadlineStub`s render in a new compact variant beneath it. Prior
scoring-calibration work is shipped and unchanged (`05173e9`). `tsc`, eslint,
`npm test` (228 pass) and `npm run build` are clean. **Not yet seen in a
browser** (no browser tool in this container) — scroll-collapse, reduced-motion
and the on-air state still need a manual look.

Follow-up: Home stubs quieted — `DeadlineStub` keeps the ticket notches but is
a flat muted tint with the league name only (no pick type) and a "Make picks ›"
text link; the Spoiler-Free callout lost its gold glow. The temporary `compact`
prop was dropped. Not yet checked in a browser.

Design calls: shows the show's `earliestAirsAt` (lock time is per-league, so
not a banner concern); "on air" derived from `airs_at` since nothing writes
`episodes.status = 'locked'`; no "Results are in" state (`SpoilerRevealCallout`
already owns it); hidden when there is no live week; kept the season track
despite the old "Home has no season strip" note (CLAUDE.md updated).

Files: `src/lib/episode-banner.ts` (+ test), `src/components/episode-banner.tsx`,
`deadline-stub.tsx` (`compact`), `home-dashboard.tsx`, `today/page.tsx`,
`globals.css` (pulse/glow keyframes), `CLAUDE.md`.

## 2. Changes Made

Committed at `05173e9` ("Add scoring calibration layer for Dance
Card/Curtain Call/Grand Finale"):
- `supabase/schema.sql` — `scoring_settings` new columns
  (`fourth_place_points`, `fifth_place_points`,
  `bonus_picks_first_place_points`..`bonus_picks_fifth_place_points`,
  `judges_score_multiplier_customized`), recalibrated defaults on existing
  point columns, new `dance_card_calibration` table, `update_scoring_categories()`
  (19→26 args) and `start_draft()` updated.
- `src/lib/scoring.ts` — `computeWeeklyScores` drops `isFinale`, adds
  `couplesRemaining`/`totalCouples` + exported `curtainCallPayout()`;
  podium bonus keyed by numeric `finalPlacement` (1-5) instead of `Outcome`.
- `src/lib/results.ts` (`recomputeWeekScores`) — unconditionally computes
  `couplesRemaining`/`totalCouples`/`finalPlacementByCouple` every call now,
  not just resolving weeks.
- `src/lib/season-clock-sync.ts` — a second, direct caller of
  `update_scoring_categories` (bypasses the Settings form's action wrapper)
  that needed the same 7 new params; found via typecheck after regenerating
  `types.ts`, easy to miss by grepping only the obvious call site.
- `src/components/league-modules-form.tsx` — 4th/5th Dance Card inputs, new
  Grand Finale "Placement Bonus" sub-section, auto-calibration copy note.
- `src/components/pick-em-box.tsx`, `src/app/leagues/[id]/page.tsx` — "N pts
  · M couples left" pick preview.
- `src/app/leagues/[id]/settings/actions.ts` — `ScoringCategoriesInput` +7 fields.
- `src/lib/scoring.test.ts` — rewritten, 27 tests.
- `src/lib/supabase/types.ts` — regenerated from live schema.
- `scripts/monte-carlo-calibration/run.mjs` + `README.md` — new, committed
  (plain Node, no `tsx`/`ts-node` in this repo — deliberately dependency-free).
- `CLAUDE.md`, `MEMORY_HANDOFF.md` — docs updated.

**Not committed (by design):** `scratch/add-scoring-calibration.sql` (the
live-DB delta, already applied and no longer needed) and
`scratch/verify-scoring-calibration.mts` (the live integration test) — this
repo's `scratch/` has never been tracked in git, every prior session's
scratch files are local-only. Also left `ios/App/App.xcodeproj/project.pbxproj`
untouched — unrelated in-progress modification present at session start,
not this session's to stage.

## 3. Key Decisions & Lessons Learned

- **Always `git fetch && git log HEAD..origin/main` before trusting a plan
  built from local files.** This session's plan was drafted in Plan Mode
  against a checkout 23 commits behind `origin/main` (missing the
  competition-weeks restructuring). Several assumptions had to be
  re-verified against the real pulled code before implementing — function
  names, line numbers, and `episode_id` vs `week_id` scoping had all
  changed; the scoring-formula shape itself hadn't.
- **Placement bonus split into two additive halves** (Dance Card weight +
  Grand Finale weight, 50/50 variance-share) rather than moved wholesale
  into Grand Finale's weight. The UI's "Grand Finale" module was, before
  this session, exclusively the full-order prediction — 1st/2nd/3rd place
  bonuses lived entirely inside Dance Card's weight despite reading like a
  Grand Finale concept. A naive full move would've silently changed
  existing leagues' math whenever their two weights differ; the split
  preserves "toggle a module off, no renormalization needed" in both
  directions. 4th/5th tiers derive from the existing numeric finale
  position (reused from the full-order prediction), not new
  `couples.status` values.
- **`judges_score_multiplier` should *decrease* as roster size grows**
  (2.36 at size 1 → 1.05 at size 6) — opposite the original spec's prose
  ("spread shrinks as leagues grow"). Real finite-population-sampling
  effect: Dance Card scores as a *sum* across a roster, not an average, and
  a sum's variance rises (not falls) until roster size passes half the cast
  size — a threshold this app's ≥2-manager minimum never lets a league
  reach. **Confirmed with Kylie: leave as built, no code change** — a
  uniform multiplier can't change the skill/luck *ratio* within Dance Card
  anyway, only its total magnitude, so equalizing literal measured variance
  (the spec's own definition of "spread") is the correct, achievable goal
  regardless of the mismatched prose justification. Full reasoning saved in
  auto-memory (`mirrorball_madness_scoring_calibration.md`).
- **Monte Carlo calibration scripts belong outside `src/`, in plain JS** —
  no `tsx`/`ts-node` in this repo; a TypeScript one-off would need extra
  tooling just to run once.
- **A live integration test caught what a `grep` for the RPC name alone
  would've missed**: `season-clock-sync.ts` calls `update_scoring_categories`
  directly, not through the Settings action wrapper. Regenerating
  `types.ts` and re-running `tsc` surfaced it immediately; worth re-running
  a full typecheck (not just building the file you think you changed)
  after any RPC signature change.

## 4. Backlog & Deferred Items

- Manually click through the Settings form's new Placement Bonus fields and
  a live Curtain Call pick in a browser — no browser automation tool in
  this container, and the RPC-level live test already exercises the same
  server paths, so this is unseen-but-likely-fine polish, not a known gap.
- Re-run the Monte Carlo script against real Season 35 data once a season's
  worth of judge scores / elimination order / manager pick accuracy exists
  — see `scripts/monte-carlo-calibration/README.md`.
- `dance_card_calibration`'s clamp-to-nearest-roster-size path (only
  exercised when roster size falls outside the swept 1-6 range) wasn't run
  live — worth a check if a very-few-managers league shows up against this
  season's 16-couple cast (roster_size could reach 8).
- DND / "—" live check still owed (pre-existing, unrelated to scoring).
- Actually deleting `auth.users` / profiles / league history — still no
  safe automatic path (pre-existing, unrelated).

## 5. Next Steps

Nothing blocking or in-flight. When resuming:
1. Default to waiting for the next feature request or bug report.
2. If picking up the browser QA item above, no schema/type work is needed
   first — everything is live and verified server-side already.
