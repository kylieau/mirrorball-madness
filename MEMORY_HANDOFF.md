# Session Handoff

## 1. Current State

Option B — competition weeks that can group multiple TV episodes — on branch `cursor/competition-weeks-option-b-a825`. Draft PR only — do not merge from the agent. Do not reuse/overwrite PR #28 (Option A: fold premiere nights into one episode row).

## 2. Changes Made

- New `competition_weeks` table (`week_number`, theme, elim/finale/double flags). `episodes` now have `episode_number` (TV / S35 E0x) and nullable `week_id` (null = exhibition). Predictions and `weekly_manager_scores` unique on `(league, manager, week_id)`. Dance scores stay on `episode_id`.
- Owner-run `supabase/apply-competition-weeks.sql`: migrate live DB (after `is_scoring` + folded premiere from `apply-s35-premiere-fold.sql`). 1:1 weeks for existing scoring episodes; group a still-split premiere under Week 1 without merging rows; if Week 1 was folded to a single episode, insert an empty Night Two under that week (dances stay on Night One; owner re-ticks split cast).
- Fan Results/Picks carousels: one stop per week (`?week=` = week UUID). Copy is `Week N` / `Week N — {theme}`; multi-night weeks may show `Night One + Night Two`. Week complete iff every assigned episode is completed. Fan Results stacks 2+ eliminated couples on separate lines.
- Admin Schedule title is **Schedule**; episodes nested under week headers; S35 E0x on episode rows; no competition-week checkbox (blank week number = exhibition). Enter/View Results chrome is by Week, not leading with S35 E0x.

## 3. Key Decisions & Lessons Learned

- True `week_id` (not a canonical episode standing in for the week). Curtain Call lock is `min(airs_at)` of the week's episodes.
- Finale: one round with 2 elims = one week; two true rounds the same calendar week = two weeks. Do not reintroduce `week_part`.
- Apply SQL before deploying app code that reads `competition_weeks` / `week_id`. This container has no live DB credentials.

## 4. Backlog & Deferred Items

- Live SQL not applied in this container — owner must run `supabase/apply-competition-weeks.sql` in the Dashboard SQL Editor, then re-tick Night One vs Night Two cast if the fold undo inserted an empty Night Two.
- DND / "—" live check still owed.
- Auto-draft later niceties: countdown + nudge; pause if half the league ghosts; seeded RNG; undo after draft complete.
- Actually deleting `auth.users` / profiles / league history — still no safe automatic path.

## 5. Next Steps

1. Run `supabase/apply-competition-weeks.sql` against the live project before previewing against real data.
2. Preview checklist is in the PR body (Schedule grouping, Results/Picks one stop per week, stacked elims, exhibition omitted).
3. Merge when ready — do not merge from the agent.
