# Scoring calibration — Monte Carlo script

One-time offline tool, not runtime code. Produces the literal default point
values pasted into `supabase/schema.sql` (`scoring_settings` column
defaults, `dance_card_calibration` seed rows). See
`run.mjs`'s header comment for the full design and every free parameter.

## Running it

```
node scripts/monte-carlo-calibration/run.mjs
```

Plain Node, no build step, no dependencies — deliberately kept that way so
it never needs `tsx`/`ts-node` (not installed in this repo) to run.

## Re-fitting against real Season 35 data

The spec this was built from calls for exactly that once real data exists.
To do it:

1. Replace the couple-skill/elimination model (`simulateSeason` in
   `run.mjs`) with parameters fit to real Season 35 judge scores and
   elimination order, instead of the illustrative `SKILL_SD` /
   `JUDGE_SCORE_*` / `ELIM_NOISE_SD` constants at the top of the file.
2. Replace `ELIM_GUESS_HIT_RATE` / `TOPSCORER_GUESS_HIT_RATE` /
   `GF_ORDER_NOISE_SD` with real manager pick-accuracy numbers, once a
   season's worth of real `predictions`/`grand_finale_predictions` rows
   exist to measure them from.
3. Re-run, paste the new numbers into a fresh schema-change `.sql` (same
   pattern as the original rollout — `ALTER COLUMN ... SET DEFAULT` for
   existing columns, a fresh `dance_card_calibration` seed for the
   roster-size table).
4. Recalibrating does **not** retroactively change already-published
   `weekly_manager_scores`, and does not change `judges_score_multiplier`
   for leagues that have already drafted (see the scoring-defaults plan's
   §6 rollout notes) — only future leagues, or leagues that draft after the
   re-fit ships, pick up the new numbers.

## Grand Finale methods

The full-order pick is scored three ways (`exact_position`, `distance_based`,
`band_tier` equal/graded) and each gets its own `bonus_picks_points_per_correct`
solved to the same `bonusPicksBudget`. The non-exact methods' shape knobs are
fixed script parameters (`DISTANCE_ZERO_AT`, `BAND_WIDTH`, `GRADED_BAND_*`),
not solved. Partial-credit methods are especially sensitive to
`GF_ORDER_NOISE_SD` (how good managers are at ordering the cast), so re-fit that
first when real pick data exists.

## Known simplifications (worth revisiting on a re-fit, not blocking now)

- Single elimination per week only — double-elimination weeks aren't
  modeled. Second-order effect on the calibration, not expected to matter
  much for the overall magnitude.
- `judges_score_multiplier` is the only constant solved per roster size.
  Placement-bonus point values (both halves) are solved once at
  `REFERENCE_ROSTER_SIZE` (3) and shipped as flat globals — in reality a
  bigger roster gives a manager more chances to have rostered a top-5
  finisher, which likely shifts placement-bonus variance by roster size
  too. Not modeled, by design (matches the shipped schema, which only has
  one roster-size-keyed column).
- The two placement-bonus halves (Dance Card's and Grand Finale's) are
  scaled from an identical raw shape, so they land on identical point
  values by construction. Nothing requires that going forward — if real
  data suggests the two halves should look different, they can be solved
  independently.
- **The roster-size sweep found something counter to the spec's own
  intuition**: over the practical range (roster size 1-6, cast size 12),
  Dance Card's raw variance *increases* with roster size, not decreases —
  so `judges_score_multiplier` needs to *shrink* as roster size grows
  (2.36 at roster size 1, down to 1.05 at roster size 6), the opposite
  direction the spec's prose assumed ("Dance Card's spread shrinks as
  leagues grow"). This is a real finite-population-sampling effect (a
  manager's roster total is a sum, not an average, across their couples;
  summing more draws generally increases variance until roster size
  approaches half the cast, where it turns over) — the spec's intuition
  about *signal* (skill becoming more visible as luck averages out over a
  bigger roster) doesn't necessarily track raw *variance magnitude*, which
  is what "spread" is actually defined as and what gets equalized. Worth
  Kylie's awareness; doesn't block shipping the measured numbers.
