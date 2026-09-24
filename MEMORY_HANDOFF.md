# Session Handoff

## 1. Current State
Nothing in flight. **Standings Score History is committed and pushed** (`276bab8`, `d1b0153`, `1e76739` on `origin/main`); `tsc`, `eslint src` and all 380 tests pass. Verified against live data (read-only, service role): reconstructed Dance Card and Curtain Call lines match stored `weekly_manager_scores` within 0.01 for every non-Spoiler-Free manager. **Not** verified: a full `npm run build` (a dev server I started is holding port 3000) and any in-browser check by me — the user reviewed each visual piece in their own dev preview and signed off.

Shipped this session:
- **Score History**: each Standings leaderboard row expands in place (accordion, several open at once) into a fixed `h-72` scrolling panel — pinned module chips (multi-select, none = All), collapsible totals bar, sticky week dividers with Pts/Total labels. Lines are reconstructed, not stored: `getScoreHistory` → `loadScoreHistory` (viewer's own client, RLS gates peers) → `buildScoreHistory` (pure, parity-tested against `computeWeeklyScores`/`computeGrandFinalePoints`).
- **Standings tab redesign**: per-manager leaderboard cards (brighter `rank-up`/`rank-down` arrows, week points under name, Libre Caslon Text rank numbers via `font-rank`), gold-italic comment-only message beside the rank badge, emoji on the module tiles, Points by Module removed, new "Dance Card Rosters" section (`dance-card-rosters.tsx`, muted-gold manager cards).
- **Scoring fixes** (take effect only on the next publish of each week): the league's Anchor Week (`judges_score_starts_week`) now gates *every* module (Curtain Call and Grand Finale used to pay before it); podium placement is attached only to the row that settles a couple's fate (`RESOLVING_OUTCOMES`, now exported from `scoring.ts`).
- Kylie is republishing Weeks 1 and 2 **from the dev server** (a publish from the live site used the old code until this push deploys). Week 1 stored rows were still stale when last checked.

## 2. Changes Made
Ours (all committed): `src/lib/{score-history,score-history-data,results,scoring}.ts` + `score-history.test.ts`, `src/app/leagues/[id]/{page.tsx,score-history/actions.ts}`, `src/app/{layout.tsx,globals.css}`, `src/components/{score-history-panel,standings-leaderboard,standings-table,dance-card-rosters}.tsx`, `standings-module-breakdown.tsx` (deleted), `CLAUDE.md`, `BACKLOG.md`, `docs/design/standings-score-history/` (copied from `origin/cursor/standings-score-history-assets-bf76`). League at a Glance was briefly refactored and fully reverted — unchanged.
**Not ours, leave unstaged:** `ios/App/App.xcodeproj/project.pbxproj`; untracked `claude/` and `scratch/`.

## 3. Key Decisions
- **Anchor Week gates all modules**; finalists: only ~4–5 couples reach the finale and get placements (not eliminations), and doubles are never known ahead of time — never assume one elimination per week (in `CLAUDE.md` + memory). `plannedEliminationWeek` uses real counts for weeks the viewer can see, a one-per-week projection otherwise.
- **Lines carry the category weight** (`× 0.5 Wt` suffix only when ≠ 1); stored totals stay authoritative. Labels: `Whitney: Jdg 38 × 0.15`, `Home: Danny · ✓` (green check) / `🤏` (plain yellow, no skin tone), `Ezra: Elim W4 · Off 2` / `Exact`, `Ilona: Finale · Exact`. Celeb first name only, no week prefix, colons not em dashes. Wrong picks are 0 pts and hidden.
- **UI taste calls (don't re-litigate):** only theme colors — never pick arbitrary hues (teal and burgundy were rejected; muted gold is the accent); no bubbles or gold rules around the message; rank-number fonts were auditioned to death, Libre Caslon Text bold won; totals bar unpinned, chips pinned.
- **Curtain Call second elimination pick** is scored only when a week is flagged `is_double_elimination_week`; Week 1 had two eliminations but isn't flagged (moot while its Anchor Week pays nothing).
- Never `npm run build` / `rm -rf .next` while a dev server holds port 3000; the earlier dev server died under memory pressure (heavy parallel tsc/eslint), so avoid running them all at once. No browser in this container.
- Shared working dir: `git fetch` + `git status -sb` before writing; stage files by name, never `git add -A`.

## 4. Backlog & Next Steps
Deferred work is in [BACKLOG.md](BACKLOG.md): `judges_score_multiplier` lock, tap-affordance mockups for leaderboard rows (Kylie is sending), live check of Score History on republished data, full build owed, plus older items. A saved memory reminds you to prompt Kylie to republish Weeks 1 and 2 once she's happy.

Next: confirm Kylie's republished Week 1 rows are gone (read-only query on `weekly_manager_scores`), then with the dev server stopped on port 3000: `npm run build`.
