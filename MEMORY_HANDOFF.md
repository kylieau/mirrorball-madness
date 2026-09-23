# MEMORY_HANDOFF

_Last updated 2026-09-23 (end of session). Read this first, then `CLAUDE.md`._

## 1. Current State

**No feature is actively in progress. Everything from this session is
committed and pushed to `main` (HEAD `b4222d4`), and the live production
database has been backfilled to match.** This was a bug-fix session, not a
feature session: the user spotted decimal scores in the app (e.g. `+43.75
this wk` on Curtain Call, `179.73200000000003 pts` on the Leaderboard) and
this session traced it to the scoring calibration layer and fixed it end to
end, in code and in already-published live data.

## 2. Changes Made

Source of truth: `git diff --stat e236a24..HEAD` (e236a24 = HEAD at session
start), 3 files, +17/−11:

```
 src/components/league-modules-form.tsx |  2 +-
 src/lib/scoring.test.ts                |  7 ++++---
 src/lib/scoring.ts                     | 19 ++++++++++++-------
```

One commit, pushed: **`b4222d4`** — Round fantasy scores to whole numbers.

- `src/lib/scoring.ts`:
  - `resolveCurtainCallGuess()`: the `"exact"` verdict branch now returns
    `Math.round(exactPayout)` instead of the raw fractional payout. The
    `"near_miss"` branch is untouched — `curtainCallNearMissPoints()` still
    floors the **raw, unrounded** payout, per its existing documented
    design (a test asserts `curtainCallNearMissPoints(curtainCallPayout(31,
    5, 10))` is `3`, not `4` — don't "fix" that into rounding first).
  - `computeGrandFinalePoints()`: rounds each manager's accumulated total
    before returning (covers fractional `distance_based`/graded `band_tier`
    payouts).
  - `computeWeeklyScores()`: rounds `rosterPoints`/`predictionPoints`/
    `grandFinalePoints` per manager, then rounds the weighted `totalPoints`
    sum too (category weights like `eliminations: 0.5` can reintroduce a
    fraction even from whole inputs).
- `src/lib/scoring.test.ts`: updated the two tests whose expected values
  were deliberately fractional (`77.5`→`78`, `17.5`→`18`) to match the new
  rounded output. `src/lib/past-picks.test.ts` needed no changes (its
  `exactPayout` fixtures were already whole).
- `src/components/league-modules-form.tsx`: the read-only "Judges' Score
  Multiplier" `SettingRow` now renders `judgesScoreMultiplier.toFixed(2)`
  (e.g. `2.36`) instead of the raw stored value (`2.362`). **The editable
  input and the underlying stored value are untouched** — full calibration
  precision still drives the actual scoring math.
- **Live DB backfill (not a code change):** ran a one-off `update` on all
  25 `weekly_manager_scores` rows (all sharing one `week_id` — only one
  competition week has been scored so far this season), rounding
  `roster_points`/`prediction_points`/`grand_finale_points` and
  recomputing `total_points` from those rounded values using each league's
  own category weights. Confirmed via a read-only check script:
  **0 rows with a non-integer column, down from 25/25.** The user ran the
  SQL themselves via the Supabase SQL editor (handed over per CLAUDE.md's
  "no bash heredoc for SQL" rule) rather than having Claude execute a live
  write directly — a write to shared production data was blocked by the
  harness's auto-mode classifier ("Modify Shared Resources") pending
  explicit confirmation, and the user chose to run it themselves.
- **Not committed, left alone on purpose:**
  `ios/App/App.xcodeproj/project.pbxproj` (pre-existing, unrelated, predates
  this session) and `scratch/` (untracked one-off verification/backfill
  scripts — `check-weekly-scores-decimals.mjs`,
  `backfill-round-weekly-scores.mjs`, `backfill-round-weekly-scores.sql` —
  never committed, established convention in this repo).

## 3. Key Decisions & Lessons Learned

- **Root cause:** the scoring calibration layer (`05173e9`, 2026-09-20)
  seeded `judges_score_multiplier` with roster-size-keyed decimal defaults
  (`dance_card_calibration`: 2.362 / 1.618 / 1.332 / 1.168 / 1.072 / 1.053).
  `computeWeeklyScores()` multiplied by this and never rounded, so the
  decimal flowed straight into `weekly_manager_scores` (a `numeric` column
  — the DB never stopped it) and out to every display surface (no
  `toFixed`/rounding anywhere in `src` before this session). Two display-only
  helpers (`roster-couple-points.ts`, `roster-weekly-points.ts`, for "Your
  Fantasy Roster") already rounded this exact arithmetic — the gap was
  specifically in the real scoring engine, not a project-wide oversight.
- **Explicit user decision, confirmed via AskUserQuestion after a flagged
  trade-off:** round every *computed score*, but leave the
  `judges_score_multiplier` **value** itself at full calibrated precision —
  it still drives the real math and is still what's stored. Only its
  *display* in League Settings got cleaned up. Rounding the real value would
  have collapsed roster sizes 3–6 down to the same multiplier (1) and sizes
  1–2 to the same multiplier (2), undoing most of the previous session's
  calibration work. **If this ever gets re-litigated, the answer already
  given was: display-only, keep full precision internally.**
- **"Self-heal on next publish" is NOT true for cumulative season
  totals — this was a real correction mid-session.** Claude initially told
  the user a live-data backfill was optional because unrounded weeks would
  "self-heal" the next time they're corrected/republished. That's true
  per-week, but the Leaderboard's season total is a **live `sum()` over every
  stored `weekly_manager_scores.total_points` row**
  (`src/app/leagues/[id]/page.tsx` ~line 190) — already-published weeks
  that never get individually corrected again would carry their decimal
  contribution in every manager's total *indefinitely*. The user caught
  this by screenshotting the Leaderboard showing raw float-drift artifacts
  (`179.73200000000003`), which is what triggered doing the backfill after
  all. **Lesson: when a bug's fix only applies going forward, check whether
  anything downstream aggregates/sums the old values before calling it
  "self-healing."**
- **The per-league "module breakdown" display
  (`src/app/leagues/[id]/page.tsx` ~line 256-276, Dance Card/Curtain
  Call/Grand Finale by-category numbers) already applied category weights
  live and rounded with `Math.round` at read time** — this was already
  correct and untouched. Only the main Leaderboard total (a raw summed
  `total_points` column) and the Curtain Call weekly recap
  (`past-picks.ts`'s `buildPastPicksComparison`, which intentionally uses
  the *stored* `predictionPoints` rather than recomputing it — see the
  comment at `past-picks.ts:248-250`) were exposed to the stale decimal
  data.
- **Live DB writes are gated by the harness even with service-role
  credentials available.** `MEMORY_HANDOFF`'s earlier note that this
  container "has direct REST/service-role access" is true for reads and
  for RPC-authorized writes, but a raw `.update()` across many rows of
  shared production data still triggered an auto-mode permission block.
  When that happens, the fallback is the established CLAUDE.md pattern:
  hand the user a plain SQL statement (not a bash heredoc) to run via the
  Supabase Dashboard SQL editor themselves, then verify with a read-only
  script afterward.

## 4. Backlog & Deferred Items

1. **Home page curtain banner copy** — carried over from before this
   session, still not started. Edit `statusCopy()` in
   `src/components/episode-banner.tsx` (~line 16) per whatever wording the
   user wants next time it comes up. States, for reference:
   - `on_air` + Curtain Call on somewhere → title **"On Air Now"**, sub
     **"Picks are locked"**.
   - `on_air` + Curtain Call off everywhere → title **"On Air Now"**, no
     subtitle.
   - `picks_open` + Curtain Call on → title **"Picks open"**, sub
     **"Airs {date/time}"**.
   - `picks_open` + Curtain Call off → no title at all, just
     **"Airs {date/time}"**.
2. `league-rosters-card.tsx` ("Dance Cards" on Standings) still shows only
   a bare dimmed "Eliminated" label with no In Jeopardy pill (carried over,
   optional consistency pass, not requested).
3. Carried over, still low-priority/optional: a mid-season backfill helper
   for In Jeopardy marks; a commissioner-facing "who got In Jeopardy credit
   this week" glance on Publish.
4. Not investigated this session, worth a glance if it comes up again: the
   category-weight `SettingRow`s in `league-modules-form.tsx` (Curtain Call
   / Dance Card weight rows, ~lines 450-451) render their raw values the
   same way the multiplier used to — if a commissioner sets a fractional
   category weight (e.g. `0.5`), those would show a decimal too. Not fixed
   this session because it wasn't what the user flagged, and it's a
   settings *input* display rather than a *score* — same category as the
   multiplier's "display only" treatment if it ever comes up.

## 5. Next Steps

No work is queued from this session. The scoring-decimals bug is fully
closed (code fix + live backfill verified at 0 fractional rows). Check with
the user for what's next — likely either the Home banner copy (§4.1) or a
new task entirely.
