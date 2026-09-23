# Session Handoff

_Last updated 2026-09-23. Read this first, then `CLAUDE.md`._

## 1. Current State

Curtain Call **In Jeopardy** is implemented on this branch and opened as a draft PR. It is not merged, and it is not live until the owner runs `supabase/apply-curtain-call-in-jeopardy.sql`.

`src/lib/supabase/types.ts` is hand-updated to match that SQL. This environment has no `SUPABASE_ACCESS_TOKEN`, and the live project does not have the new column or tables until the SQL runs. Regenerate types afterward.

## 2. Changes Made

- `scoring_settings.curtain_call_near_miss_enabled` (default true, backfills existing leagues). Folded into `update_scoring_categories` and the Season Clock lock. Fraction is hardcoded 0.25 in `curtainCallNearMissPoints` — no settings dial.
- `episode_in_jeopardy_couples` and `draft_episode_in_jeopardy_couples`, delete-then-reinsert like participants. Eliminated couples are dropped before insert.
- `computeWeeklyScores` / past picks / the pick-em preview share `classifyEliminationGuess`, `classifyTopScorerGuess`, and `resolveCurtainCallGuess`.
- Enter Results ticks, fan Results badges (In Jeopardy replaces Safe), Scores outcome text, past-picks tri-state with floored points, Curtain Call settings toggle.
- Not retroactive: the apply script does not rewrite `weekly_manager_scores`. The next publish or correction recomputes that week.

## 3. Key Decisions

- Elim near-miss is only the manual tick set. Top-scorer near-miss is weekly judges total in `[M−1, M)`. Ties at `M` are exact. A couple absent from the score map cannot top-scorer near-miss.
- Exact always wins. Double-elim guesses are independent, each floored on its own.
- Past-picks footer stays the stored `prediction_points`. Per-guess In Jeopardy points are what the rule pays; standings pick them up on the next publish.

## 4. Backlog & Deferred Items

- Equal-EV scoring defaults, Monte Carlo recalibration, and Lotus stay out of scope.
- Owner-run SQL, types regen, and a live click-through after the SQL is applied (tick In Jeopardy, publish, confirm the badge, a within-1 top scorer, and the settings toggle freezing with the Season Clock).

## 5. Next Steps

1. Owner runs `supabase/apply-curtain-call-in-jeopardy.sql`, then regenerates `src/lib/supabase/types.ts`.
2. Leave the PR draft until that SQL has run and the click-through above is done. Do not merge before the SQL.
