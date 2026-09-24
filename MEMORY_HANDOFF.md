# Session Handoff

## 1. Current State
**All of this session's work is committed and pushed** (`cd2ff92` on `origin/main`, on top of the handoff commit `50efbaf`, which briefly left `main` without `dance-card-rosters.tsx` before the code commit landed). Checked: `tsc --noEmit`, `eslint src` and all 400 tests passed at the last run; the user looked at Standings, Picks and the Home banner in their own dev preview and signed off on each tweak. **Not run:** `npm run build` (the user's `next dev` holds port 3000). **Verified live (read-only, service role):** no stored `weekly_manager_scores` rows exist before any league's Anchor Week, and `episodes.duration_minutes` exists (all 120) — the user already applied `supabase/apply-episode-duration.sql`.

Built this session:
- **Grand Finale (Picks):** a couple eliminated before the league's Anchor Week (`judges_score_starts_week`) shows "—" instead of points (`PointsTag`, `GrandFinaleScoring.scoringStartsWeek`). "Your Season Bracket" always reopens collapsed once locked (plain `useState(true)`, no persistence); expanded it is the capped, scrolling window around the next predicted elimination (`windowed`), with a chevron-only "View picks" on the next-elimination row and a right-aligned "Collapse Surrounding Picks" under the list.
- **Standings:** headings "Managers Leaderboard" / "Couples Leaderboard"; the shared gold `YouPill` replaces "(you)"; a gray dash marks an unchanged placement. **Couples Leaderboard** replaces Dance Card Rosters: fixed-height scroller with sticky Judges / Bonuses / Total header, every cast couple (undrafted shown with what-if points, italic), eliminated faded, ties and the pre-scoring state alphabetical, viewer rows gold. `buildCouplesLeaderboard` (`src/lib/couples-leaderboard.ts`, pure, parity-tested against `computeWeeklyScores`) + `loadCoupleWeekResults`.
- **Fonts:** manager-earned points use Fraunces (`font-heading`) app-wide (roster cards, League at a Glance headers, Results totals, Home, awarded Grand Finale pill); Libre Caslon (`font-rank`) stays on leaderboard placement numbers only. "Wk N" is now "W N" (`formatEpisodeCasualAbbreviated`).
- **Home curtain banner** (`src/lib/episode-banner.ts`, `episode-banner.tsx`): full new state machine per the user's contract — Picks open / Picks locked / On Air Now / Results soon / Results in (held to 48h before the next air; final week 7 days) plus global West overlays ("West feed at 8pm", "West Coast is watching"). Client re-derives state (every minute within 6h of an air time, else daily). Relative "Airs Today/Tomorrow/weekday" (`format-airs.ts`). Season track (`seasonTrack`): Results in checks the finished week and glows the next week captioned "Up next". New `episodes.duration_minutes` (Schedule form field, `results.ts`, `schema.sql`, `types.ts`).

## 2. Changes Made
Ours (all committed): `CLAUDE.md`, `BACKLOG.md`, `supabase/{schema.sql,apply-episode-duration.sql}`, `src/lib/{episode-banner,episode-banner.test,couples-leaderboard,couples-leaderboard.test,couples-leaderboard-data,format-airs,format-airs.test,format-week,format-week.test,competition-week,league-home-summary,results,results-page-data,score-history,score-history-data}.ts`, `src/lib/supabase/types.ts`, `src/app/{today,leagues/[id]}/page.tsx`, `src/components/{episode-banner,couples-leaderboard,you-pill,home-dashboard,schedule-manager,results-screen,standings-table,standings-leaderboard,grand-finale-box,grand-finale-order-list,roster-card,league-rosters-card,dance-card-league-list,curtain-call-league-list,weekly-results-view}.tsx`; `dance-card-rosters.tsx` deleted (staged).
**Not ours, leave unstaged:** `ios/App/App.xcodeproj/project.pbxproj`; untracked `claude/` and `scratch/`.

## 3. Key Decisions
- **An explicit rule beats a mockup.** Manager-earned points are always Fraunces even where a mockup shows sans; general points talk (settings values, "up to N pts", explainer copy) is not.
- Grand Finale "—" is display-only: the engine and score history already gate every module on the Anchor Week (`scoringStarted` in `results.ts`, `anchorWeek` in `score-history.ts`).
- Bonuses column = survival + podium + per-couple bonus only; Curtain Call and Grand Finale points are manager-level and never in it.
- Banner: East-live `airs_at` drives lock/on-air; West feed is copy-only and wins over every other state. Multi-night weeks follow the earliest unpublished episode, and Curtain Call locks per week, so Night 2 reads "Picks locked · Airs …" (deliberately differs from the contract's step 4). Season over: last week's Results in holds 7 days, then no banner.
- UI taste (still binding): only theme colors; Libre Caslon for placement numbers; no light/dark toggle.
- Never `npm run build` / `rm -rf .next` while a dev server holds port 3000. Shared working dir: `git fetch` + `git status -sb` before writing; stage by name, never `git add -A`.

## 4. Backlog & Next Steps
Deferred work is in [BACKLOG.md](BACKLOG.md) (Home banner follow-ups, full build owed, Score History live check, older items).

Next: stop the dev server on port 3000, then run `npm run build`.

`git fetch && git status -sb`
