# Scoring calibration — strong-play ceilings

Offline solver, not runtime scoring. It produces the default point values
pasted into `supabase/schema.sql` (`scoring_settings` column defaults,
`dance_card_calibration` seed rows) and into
`supabase/apply-strong-play-ceilings.sql`.

The math lives in `src/lib/strong-play-ceilings.ts` so `npm test` can lock
it to those pastes. This directory only prints the paste.

## What a weight means

A category weight is a share of a **strong-play season ceiling**: the points
a good season can actually reach, not the spread of a Monte Carlo standings
table. Weight 1 on a module is one full share. Equal weights mean equal
ceilings, including Grand Finale when it is on. Grand Finale stays off by
default. Turning it on seeds its weight at 1. There is no 3/5 cap.

`POINT_SCALE = 0.1` is applied after the solve. The unscaled share is 1000,
so one share is **100 season points** and a strong week stays in the tens
instead of the thousands.

## The three ceilings

**Dance Card** is the expected strong roster for that roster size, not a
theoretical max:

- The league drafts the whole cast (`floor(cast / roster size)` managers,
  same split as `start_draft`). A strong manager reads longevity perfectly
  and sits in the **median snake seat** (the two central seats, averaged,
  when the count is even). That is not the first-overall roster.
- Each couple then follows the **skill-expected path**. Rank 1 wins. The
  finale field is 4 (inside "about 4–5"). One couple leaves per week until
  then — doubles are not known ahead of time, so they are not in the
  default ceiling. A couple dances the week they leave and does not earn
  survival for it. Only the podium earns survival on finale night.
- Judge totals are a **season average**, one dance a week, linear from 28
  for the best couple to 21 for the first couple out. Three perfect 10s
  (30) is not the path being priced.

The format plus the median seat keep survival well under 100% of
couple-weeks. At the reference roster (3, `leagues.roster_size`'s default)
the ceiling splits 65% judges / 25% survival / 10% placement. Survival
points and the placement ladder are solved once there. Every other roster
size keeps those point values and solves `judges_score_multiplier` so the
ceiling is still one share. The placement ladder keeps the shipped shape
150 / 75 / 40 / 20 / 10.

**Curtain Call** is a perfect season of picks. One correct elimination on
each pre-finale week, one correct top scorer every dance week including the
finale. The elimination base stays 3:2 against the top-scorer base. Each
week pays `base × couplesRemaining / cast`, the same formula as
`curtainCallPayout`.

**Grand Finale** is a perfect bracket. Exact position, distance, and
equal bands all pay full credit on a perfect pick, so they share one
points-per-correct. Graded bands pay a fraction on lower bands, so their
base is higher and the perfect ceiling still matches. Distance credit hits
0 at 4 spots off. Shape knobs (`BAND_WIDTH` 3, graded 75/50/25 with a 25%
floor) are not solved.

## Running it

```
node --experimental-strip-types scripts/monte-carlo-calibration/run.mjs
```

Plain Node 22 (type stripping is built in). No `tsx`. Re-paste the printed
numbers into schema defaults and a new `supabase/apply-*.sql` the way
`apply-strong-play-ceilings.sql` does. Tests fail if
`src/lib/scoring-defaults.ts`, `schema.sql`, and that migration drift from
the solver.

## Re-fitting later

This replaced the Monte Carlo standings-spread script (the old `TARGET`
variance plus a Grand Finale 3/5 cap). A future refit changes the season
shape at the top of `strong-play-ceilings.ts` — cast size, finale field,
judge band — once a real season's scores and elimination order are final.
It does not go back to equalizing manager variance.

Changing the numbers does not by itself rewrite leagues that already exist.
`apply-strong-play-ceilings.sql` is the one-shot for the four leagues that
were live when this shipped: it keeps each league's module on/off and
category weights, writes the new point budgets (multiplier from
`dance_card_calibration` by roster size), and recomputes
`weekly_manager_scores`. The owner runs that file in the Supabase SQL
editor. New leagues pick the defaults up through column defaults and
`create_league`.
