# Session Handoff

## 1. Current State
**Performance audit (BACKLOG.md "Performance audit — 2026-10-14"): all three top fixes are committed and pushed to `origin/main`.** Branch `main`, at `7a23800`. Vercel deploy not yet confirmed.
- **#1 `82fea94`**: flattened serial query waterfalls (home summary 5 rounds → 2, Picks in two parallel stages, Results one `Promise.all`, `loadRevealingWeek` alongside the cutoff). Dev medians Home 2.7 → 2.2s, Picks 3.6 → 3.0s.
- **#2 `fc08b22`**: per-request `React.cache` loaders in `src/lib/viewer-season-data.ts` (season, spoiler progress, weeks/episodes, memberships, couples) reused by the nested loaders. Picks 3.2 → 2.2s, Standings 1.9 → 1.3s.
- **#3 `91d789d`, prefetch `7a23800`**: `loadLeaguePageBase` no longer computes other leagues' summaries. The switcher calls `getSwitcherSummaries` (`src/app/leagues/[id]/switcher/actions.ts`, through `loadHomeLeagueData`) once after mount and on every open, so rows follow Home's rank rule (resolves the "switcher rank ≠ Home rank" flag; the user never answered the question, so this was a default, easy to reverse). Picks ~2.5 → ~2.1s with two other leagues; tab taps not measurably slower.
- **Verified:** signed-in SSR HTML identical before/after (28 page/state pairs for #1/#2); switcher rows equal Home's cards in a three-league check. Build, `eslint src`, 609 tests pass.
- **Not verified (needs a live night, E07 Tue Oct 20 ET):** #2 and #3 with a revealing week, released drafts, a live-revealed couple and open picks (all post-E06 runs had none). The #3 check couldn't catch rows attached to the wrong league (both extra leagues had identical values); submit a pick in one extra league to settle it.
- **E06 is officially published** (2026-10-14 05:01 UTC); its 11 live `dance_scores` rows have 4 judges and `scaled_score` = total × 3/4. Score History `Jdg 36→27` lines not yet checked in a real league.
- **2026-10-15:** Vercel confirmed Ready for `main` (`35a56d1`, status success). The #3 wrong-league gap is closed (one extra league submitted CC + GF; only its switcher row read "All caught up", matching Home from all three leagues). `RevealAutoRefresh` no longer overlaps refreshes on slow renders (transition + timer cleared while in flight, windows via ref); verified with a temp delayed-render page and faked clock, old component overlapped, new one doesn't. Merged branch `fixes/finale-bonus-audit-schedule` deleted from origin.
- **Also 2026-10-15:** Home's auto-refresh now matches the other pages (`!!revealing && revealingVisible`); `getAuthUser` (`React.cache`) dedupes `getUser()` across layout/page/loader; the draft-night manager scores reuse the base's roster slots instead of a serial re-query (`draftManagerScoresForNight`, tested). Build, lint, tsc, 611 tests pass; signed-in/out smoke on a production build. Not seen on a live night.
- Earlier `384f78d` work (atomic publication, autosave fix, redirect validation, spacing pass) is pushed; the atomic publication migration is installed live.

## 2. Changes Made
This session (all committed and pushed): `src/lib/viewer-season-data.ts` (new), `src/app/leagues/[id]/switcher/actions.ts` (new), and edits to the page loaders (`league-home-summary.ts`, `league-page-data.ts`, `home-league-data.ts`, `revealing-week-data.ts`, `score-history-data.ts`, `draft-scores-data.ts`, `spoiler-cutoff.ts`, `account-settings-data.ts`, `other-league-picks.ts`, `league-module-stack-data.ts`), `(fan)/page.tsx`, Results and Picks pages, `league-switcher.tsx`, `league-header.tsx`, `league-page-shell.tsx`, BACKLOG.md, CLAUDE.md. Scratch QA leagues/accounts removed; temp scripts deleted.

**Not ours; leave unstaged:** `.devcontainer/devcontainer.json`, `.devcontainer/Dockerfile.codex`, `.devcontainer/devcontainer-lock.json`, `.gitignore` (adds `/.codex-private/`), `ios/App/App.xcodeproj/project.pbxproj`, `supabase/queries/prefill-s35-e06-dances.sql`, `supabase/queries/add-bryan-s35-w05-curtain-call.sql` (both already run).

## 3. Key Decisions
- **No cross-request caching** for episodes, weeks, scores, results, predictions or spoiler progress (spoiler cutoff and reveal state depend on them; reads run under each viewer's RLS). `React.cache` per request only.
- **Attribution:** commits this session end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (per the harness reminder for the current model).
- **Perf verification method:** seed scratch league (`scripts/qa-screenshots/seed.mjs up`) + a second league via `create_league`; sign in with playwright; fetch SSR HTML with scripts/links stripped for each Spoiler-Free state; swap changed files to `HEAD` for "before". **Restart `next dev` fresh for each side**: repeated hot swaps grew next-server to 3.3 GB in this ~8 GB container and requests timed out. Kill it with `kill $(pgrep -f "^next-server")`; `pkill -f "next dev"` also kills the calling shell.
- **Container memory is tight** (~8 GB, swap full from other tenants/VS Code): `next dev` page compiles can take minutes and playwright `networkidle` times out. For browser checks use `next build` + `next start` (much lighter), with `.next` removed afterward if a temp route was built (`rm -rf .next`, stale types otherwise break tsc). Playwright `page.clock.install()` + `runFor` lets you step 20s intervals without waiting. Don't `pgrep -f` for your own script name in a wait loop; it matches the shell itself.
- **Vitest doesn't resolve `@/`**: modules imported by tests (e.g. `spoiler-cutoff.ts`) use relative imports.
- **Curtain Call lock** (settled 2026-10-07): per-league coast + signed offset, capped at the broadcast's end; Grand Finale deadline stays East. See CLAUDE.md.
- **Direct writes past the pick lock are blocked by the safety policy.** For one-off fixes, hand the user a guarded `.sql` block for the Dashboard SQL Editor.
- **Guest judges / scaling** (settled 2026-10-13): guests per episode on Schedule; fantasy judges points on a 3-judge basis; Curtain Call top scorer stays raw. Multi-dance nights not normalized (BACKLOG calibration item).
- **Dependency audit** (settled 2026-10-13): leave Next's bundled `postcss@8.4.31`; `@capacitor/cli` ^7 vs ^8 left alone (ask first, iOS session owns `cap sync`).
- **Handoff skills:** `sync-handoff` / `resume-handoff` are account-level skills with synced copies under `~/.claude/skills/synced/`; in this session `/sync-handoff` wasn't registered as a command, so its SKILL.md was followed by hand. Don't re-add repo copies under `.claude/`. Cleanup of local copies requires asking (memory note `local-handoff-skills`).
- **Curtain Call partial credit**: two hardcoded bands (25/10), no more.
- **Retroactive scoring changes**: `scripts/recompute-published-weeks.ts` after deploying the engine change.
- **Ad-hoc scripts**: run from the project root with `NODE_OPTIONS=--experimental-websocket`; TS with top-level await must be `.mts` (`npx tsx --env-file=.env.local`). Service role can't execute `active_season_id()`/`prediction_lock_at()`.
- **Type regen**: `set -a; . ./.env.local; set +a`, then the CLAUDE.md command into a temp file and diff.
- **gh CLI**: `GH_TOKEN` from the VS Code git credential helper per command; never persist it.
- **Keep `next dev` running** on localhost:3000 for the preview pane; stop it only for `npm run build`, then restart.
- **Git**: `git pull --rebase --autostash`; stage by name; never `git add -A`.
- **`BACKLOG.md` edits**: `Edit` or a targeted script, never `Write`.

## 4. Backlog & Next Steps
- **E07 live night (Tue Oct 20 ET):** re-check Home/Results/Picks/Standings and the switcher with a released draft and a live-revealed couple; confirm Score History shows `Jdg 36→27`-style lines on a guest night (BACKLOG "To check").
- Perf ride-alongs are all done (`loadOtherLeaguePicks` flattened to two rounds; Recast's current roster and available-couples reads come from the base's `rosterSlotPeriods`, so Picks has no separate `roster_slots` query). Watch Home refresh behavior and the draft-night standings on E07.

Next command: none pending. Ask the user which ride-along flag, if any, to take next.
