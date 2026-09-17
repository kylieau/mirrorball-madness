# Session Handoff

## 1. Current State

Past picks vs results is on `cursor/past-picks-vs-results-c74f` (draft PR #15 into `main`). Owner-approved item from BACKLOG.md. League **Your Picks** tab only — not a new tab. Do not merge from the agent.

## 2. Changes Made

- Current week's Curtain Call form (`PickEmBox`) stays on top; **Past picks** card sits below it when Curtain Call is on and at least one episode is completed.
- Episode switcher reuses `WeekSwitcher` (`?tab=yourpicks&week=`). Fan labels: `Ep. N` / `Ep. N — {theme}`.
- Per selected completed episode: elim pick(s) vs actual (✓/✗), top-scorer pick vs highest summed `dance_scores.total_score` (shared `findTopScorerCoupleIds` with scoring), points from `weekly_manager_scores.prediction_points` (not recomputed). Hits collapse to a single **Nailed it** line (layout A); misses keep You vs Actual.
- Spoiler-Free: outcomes only when the episode is in `allowedEpisodeIds`. Unwatched completed weeks are in the switcher (lock icon) but the card stays locked — “Mark as watched to see how you did” — no results/points leak. Hidden when Curtain Call is off.

## 3. Key Decisions & Lessons Learned

- Top-scorer actual is the same notion as `computeWeeklyScores` (sum of `total_score`, ties all count, 0-high week has none) — extracted rather than invented a second truth.
- BACKLOG originally said `formatEpisodeLabel`; owner later standardized fan tabs on `Ep. N`. This feature follows the fan helpers.
- Preview crash (digest 403620019): `WeekSwitcher` is a Client Component; passing `hrefFor` as a function from the server Past picks card is illegal in the RSC payload and takes down Your Picks. Per-week string `href`s instead.

## 4. Backlog & Deferred Items

- Home season strip — owner-approved, still not started.
- Recast/waivers spoiler framing; `/notifications` `rankBadge` leak; roster-eliminated clamp; feature-announcement infra.
- Spectator role, league-wide miss-rate board, bottom-two / “almost had it” — still out of scope for Past picks v1.

After this work: `npm run lint` clean, `npm test` **151**, `npm run build` passed. Live phone click-path was not exercised here (no Supabase credentials in this container).

## 5. Next Steps

1. Coordinator: phone (~390px) click-path — Your Picks → Past picks → switch episodes; Spoiler-Free lock. Do not merge from the agent.
2. Otherwise wait.
