# MEMORY_HANDOFF

_Last updated 2026-09-23 (end of session). Read this first, then `CLAUDE.md`._

## 1. Current State

**No feature is actively in progress. Everything from this session is
committed and pushed to `main` (HEAD `48a9c9c`), and the live production
database has already been backfilled to match.** This was a bug-fix session:
the user reported having 1000+ points in a league after a single week of
scoring, unrecognizable next to typical fantasy-sports point totals. Traced
to the scoring calibration layer's raw magnitude (not a bug in the math —
the Monte Carlo-calibrated defaults were just large by construction), fixed
with a uniform 10x rescale across code, the calibration script, and live
data.

## 2. Changes Made

Source of truth: `git show --stat 48a9c9c`, 7 files, +171/−57:

```
 CLAUDE.md                               |  2 +-
 scripts/monte-carlo-calibration/run.mjs | 51 +++++++++++-------
 src/app/leagues/[id]/page.tsx           |  8 +--
 src/components/league-modules-form.tsx  | 16 +++---
 src/lib/grand-finale-explainer.ts       | 14 ++---
 supabase/apply-point-scale-rescale.sql  | 92 ++++++++++++++++++++++ (new file)
 supabase/schema.sql                     | 45 +++++++++-------
```

One commit, pushed: **`48a9c9c`** — Rescale calibrated scoring point values
by 10x.

- `scripts/monte-carlo-calibration/run.mjs`: added a single `POINT_SCALE =
  0.1` constant applied uniformly to every final printed/computed output
  (survival/elimination/top-scorer/placement/bonus-picks points and the
  roster-size multiplier sweep). Doesn't touch the solving logic — variance
  ratios between modules are scale-invariant, so this only changes the
  overall magnitude a manager sees, not the calibration's relative balance.
- `supabase/schema.sql`: `scoring_settings` column defaults and
  `dance_card_calibration`'s seed rows rescaled to match the script's new
  output (e.g. `elimination_prediction_points` 171 → 17.1,
  `judges_score_multiplier_default` roster-size-3 1.332 → 0.1332). Also
  fixed `create_league`'s inline `bonus_picks_distance_penalty` literal (50
  → 5).
- `src/lib/grand-finale-explainer.ts`: exported default-points-per-method
  constants (`GRAND_FINALE_DEFAULT_DISTANCE_PENALTY`,
  `defaultPointsPerCorrect`) rescaled to match.
- `src/app/leagues/[id]/page.tsx`, `src/components/league-modules-form.tsx`:
  `??` fallback literals updated to the new scale. **Bonus fix while in
  there**: `league-modules-form.tsx`'s placement-bonus fallbacks were stale
  (`150/75/40`) against the real shipped defaults (`106/53/28`) from an
  earlier calibration pass — corrected to the (now-rescaled) real values.
- **New file `supabase/apply-point-scale-rescale.sql`** — the live
  migration, **already run successfully by the user** via the Supabase
  Dashboard SQL Editor. Rescales every league's `scoring_settings` by ÷10
  (defaults *and* any already-customized values — a blanket unit
  conversion, not a recalibration, so it applies regardless of
  `judges_score_multiplier_customized`) and backfills every already-
  published `weekly_manager_scores` row: divide+round the raw components,
  recompute `total_points` from each league's own category weights.
  **Not idempotent — do not re-run.**
- **Verified live post-migration** via a read-only script
  (`scratch/verify-point-scale-rescale.mjs`, untracked, left in place per
  this repo's scratch-script convention): `dance_card_calibration` correctly
  shows 0.2362…0.1053 across roster sizes 1–6; all 5 leagues'
  `scoring_settings` rows divided by 10; all 25 `weekly_manager_scores`
  rows are whole numbers (0 non-integer columns); max single-week
  `total_points` across every league is now **110** (down from 1000+).
- **Not committed, left alone on purpose:**
  `ios/App/App.xcodeproj/project.pbxproj` (pre-existing, unrelated) and
  `scratch/` / `claude/` (untracked, unrelated in-progress work from this
  shared repo — `claude/grand-finale-picks-feedback-brief.md` in particular
  wasn't touched or read for content this session).

## 3. Key Decisions & Lessons Learned

- **The 1000+ point-per-week issue was not a bug** — `computeWeeklyScores`
  in `src/lib/scoring.ts` was doing correct arithmetic. The magnitude came
  from the scoring calibration layer's design: Curtain Call's picks are
  binary (hit/miss, once a week) while Dance Card accrues continuously from
  real judges' scores, so equalizing variance contribution across modules
  forced Curtain Call's flat per-guess payouts (171, 114 pre-rescale) to be
  large in absolute terms. Confirmed with the user this reasoning was
  correct before touching anything.
- **A uniform linear rescale is safe and doesn't require re-running the
  Monte Carlo calibration.** Every formula in `computeWeeklyScores` only
  sums and multiplies `scoring_settings` constants, so dividing every one
  of them by the same factor is mathematically identical to having run the
  calibration with a smaller target variance from the start — it preserves
  every relative-influence ratio. This was the core insight that made the
  fix low-risk.
- **User explicitly declined a bigger redesign.** Asked whether they wanted
  category weights reframed as percentage shares (e.g. "Dance Card 50%") or
  the whole scoring model turned into a normalized weighted-average index
  instead of accumulated raw points — user said no, the current
  weight-as-multiplier mechanism is already legitimate (it's built on
  equal-variance-calibrated baselines), just wanted the units shrunk.
  **If this gets re-litigated, the answer already given was: keep raw
  accumulating points, keep weights as multipliers, just rescale
  magnitude.**
- **Chose ÷10 specifically** after confirming it doesn't collapse the
  smallest calibrated values (4th/5th place bonus) into indistinguishable
  rounded output — settings-column precision was relaxed to 1–2 decimal
  places (was whole integers pre-rescale) since `computeWeeklyScores`
  already rounds once on the *combined* total, not per-component, so
  underlying precision in the settings isn't lost by the final display
  rounding.
- **This session discovered 5 leagues exist live, not the 1 implied by the
  prior handoff.** One (`6733a961…`) has different absolute scoring values
  than the other four — confirmed via the live verification script this is
  expected: it's a legacy league that predates the original 2026-09-20
  scoring-calibration rollout and was deliberately never backfilled to
  calibrated values back then (a documented decision at the time). The
  rescale correctly preserved that league's own pre-existing numbers rather
  than silently also re-calibrating it, which would have been a separate,
  unrequested change.
- **Live DB writes are still gated by the harness**, consistent with prior
  sessions — this container has service-role read access (used for the
  post-migration verification) but the rescale migration itself was handed
  to the user as a plain SQL block (not a bash heredoc, per `CLAUDE.md`) to
  run via the Supabase Dashboard SQL Editor themselves.

## 4. Backlog & Deferred Items

Carried over from the prior handoff, untouched this session:

1. **Home page curtain banner copy** — edit `statusCopy()` in
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
   a bare dimmed "Eliminated" label with no In Jeopardy pill (optional
   consistency pass, not requested).
3. A mid-season backfill helper for In Jeopardy marks; a commissioner-facing
   "who got In Jeopardy credit this week" glance on Publish. Low priority.
4. The legacy league (`6733a961…`, see §3) still carries pre-2026-09-20
   uncalibrated *relative* point values (e.g. elimination guess worth 2x
   top-scorer guess, rather than the calibrated ratio) — only its magnitude
   was rescaled this session, not its underlying calibration. Not fixed
   because backfilling it to the calibrated ratios was explicitly out of
   scope (a bigger, unrequested change) — flag if it comes up again.
5. Not investigated this session, worth a glance if it comes up again: any
   other UI surface that reads `scoring_settings` point values directly and
   might format them assuming whole integers (the rescale introduced
   decimals like `17.1`, `10.6` into fields that were always whole numbers
   before) — `league-modules-form.tsx`'s `SettingRow`s were checked and are
   fine (raw value render, no whole-number assumption), but this wasn't an
   exhaustive UI sweep.

## 5. Next Steps

No work is queued from this session. The point-scale rescale is fully
closed: code committed and pushed, live migration run and verified (0
fractional scores, max single-week total now 110 instead of 1000+). Check
with the user for what's next — likely the Home banner copy (§4.1) or a new
task entirely.
