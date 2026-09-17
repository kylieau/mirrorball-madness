# Session Handoff

## 1. Current State

DND display verification on latest `main` (`ffd0654`). No code change. No live published `episode_results.outcome = 'bye'` row is available in this environment (no Supabase credentials), so the UI still cannot be confirmed against a real episode.

## 2. Changes Made

None. This session was verify-only.

Traced storage → render:

- Stored as `episode_results.outcome = 'bye'` (check constraint). Admin Enter Results label is "Did Not Dance"; `couples.status` stays `active`.
- Publish copies draft `outcome` through `publishEpisodeDraft` → `applyEpisodeResults` unchanged.
- Admin View Results (by week / by couple) maps `bye` → outcome **DND** and pts **—** in `all-results-view.tsx`.
- Public This Week uses `WeeklyResultsView` (`this-week/page.tsx`): badge **DND**, judges pts **—**.
- Scoring already treats `bye` as no survival points (`NO_SURVIVAL_OUTCOMES`).

Those three requested surfaces look correct. The remaining gap is a published week that actually contains a Did Not Dance couple.

## 3. Key Decisions & Lessons Learned

- Do not invent a fake production DND row to "complete" this check. Display is outcome-gated (`outcome === "bye"`), not total-gated, so leftover `0` dance totals would still render as **—** once the outcome is `bye`.
- Dance Card roster (`roster-card.tsx` / `deriveCoupleWeeklyTag`) only knows Safe/Eliminated from `couples.status` and was out of scope. A DND couple stays `active`, so that card would still read Safe / `0 this wk` — different surface, different number (fantasy points, not judges' pts).

## 4. Backlog & Deferred Items

- **DND live check (this session):** human publishes one Did Not Dance couple, then confirms Admin → View Results (by week and by couple) and public This Week. See below.
- Manual browser verification still owed for Season Clock + Grand Finale deadline caption.
- Phone (~390px) visual pass on Admin → Settings is for the coordinator (owner has a dedicated test login). Do not put credentials in the PR, commits, docs, or screenshots.

## 5. Next Steps

Human / live episode check (the only remaining DND work):

1. Admin → Enter Results: set one participating couple to **Did Not Dance**, do not add dances, Publish.
2. Admin → View Results → By week: that couple shows Outcome **DND**, Pts **—** (not `0`).
3. Same week → By couple: that week's row shows **DND** / **—**.
4. Public This Week (that episode): badge **DND**, judges' pts **—**.

Until that week exists, treat DND display as code-complete and unverified in production.
