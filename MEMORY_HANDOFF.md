# Session Handoff

## 1. Current State
**Performance audit (BACKLOG.md "Performance audit — 2026-10-14") is finished and pushed to `origin/main`.** Branch `main`, at `74035c0`, in sync with origin. Vercel was confirmed Ready for `35a56d1`; the four commits after it (`09ea536`, `ce696ac`, `ab88a35`, `74035c0`) have not been checked on Vercel.
- **Earlier (`82fea94`, `fc08b22`, `91d789d`, `7a23800`):** flattened query waterfalls, per-request `React.cache` loaders in `src/lib/viewer-season-data.ts`, switcher summaries loaded by `getSwitcherSummaries` after mount and on open (rows follow Home's rank rule).
- **`09ea536`:** `RevealAutoRefresh` runs `router.refresh()` in a transition and clears its timer while a refresh is in flight (windows read through a ref), so slow renders no longer overlap.
- **`ce696ac`:** Home refreshes only for a visible revealing week (`!!revealing && revealingVisible`), like the other fan pages; `getAuthUser` (`React.cache`, `src/lib/supabase/server.ts`) is the single Auth call for the layout, Home, Results, Manage Leagues and `loadLeaguePageBase`; draft-night manager scores come from the base's roster slots through `draftManagerScoresForNight` (`src/lib/draft-scores.ts`, tested).
- **`ab88a35`, `74035c0`:** `loadOtherLeaguePicks` loads picks with module settings in one round, then only the per-league lock/deadline RPCs; Recast's own seats and available couples come from the base's `rosterSlotPeriods` (every held slot with `slotNumber`, ungated by Dance Card), so Picks has no separate `roster_slots` query.
- **Verified:** build, `eslint src`, `tsc`, 611 tests. Picks HTML identical old vs new on production builds for a scratch viewer in three leagues (picks submitted in one, none in another) and with a real open Recast slot in a waivers league; the switcher's "All caught up" lands only on the league that submitted and matches Home; signed-in/out smoke passes.
- **Not verified (needs a live night, E07 Tue Oct 20 ET):** a revealing week, released drafts, a live-revealed couple, open picks; Home's narrowed refresh; draft-night standings through the new path. E06 is officially published (its `dance_scores` have 4 judges, `scaled_score` = total × 3/4); Score History `Jdg 36→27` lines are unchecked in a real league.
- **Dev server is stopped** (stopped for builds and not restarted). Start with `npm run dev` if the preview pane is needed.

## 2. Changes Made
This session, all committed and pushed: `src/components/reveal-auto-refresh.tsx`, `src/lib/supabase/server.ts`, `src/components/site-header.tsx`, `src/app/(fan)/page.tsx`, `src/app/this-week/page.tsx`, `src/app/leagues/page.tsx`, `src/app/leagues/[id]/picks/page.tsx`, `src/lib/league-page-data.ts`, `src/lib/draft-scores.ts` (+ test), `src/lib/draft-scores-data.ts`, `src/lib/other-league-picks.ts`, BACKLOG.md, CLAUDE.md. Merged branch `fixes/finale-bonus-audit-schedule` deleted from origin. Scratch QA leagues/accounts and temp scripts removed.

**Not ours; leave unstaged:** `.devcontainer/devcontainer.json`, `.devcontainer/Dockerfile.codex`, `.devcontainer/devcontainer-lock.json`, `.gitignore` (adds `/.codex-private/`), `ios/App/App.xcodeproj/project.pbxproj`, `supabase/queries/prefill-s35-e06-dances.sql`, `supabase/queries/add-bryan-s35-w05-curtain-call.sql` (both already run).

## 3. Key Decisions
- **No cross-request caching** for episodes, weeks, scores, results, predictions or spoiler progress (spoiler cutoff and reveal state depend on them; reads run under each viewer's RLS). `React.cache` per request only.
- **Home refresh rule (settled 2026-10-15):** Home matches Results/Picks/Standings: refresh for a visible revealing week or inside the clock windows. A viewer who hasn't opted in sees a stale posting-strip count after the live window until reload; accepted.
- **`loadOtherLeaguePicks` keeps per-league lock/deadline RPCs** (each league has its own lock); only the ordering was flattened.
- **Attribution:** commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (per the harness reminder for the current model).
- **Perf verification method:** seed a scratch league (`scripts/qa-screenshots/seed.mjs up`) plus extra leagues via `create_league` (three members and autopilot to complete a draft; `start_draft` needs 2+); sign in with playwright and fetch SSR HTML with scripts/links stripped; compare a build of `HEAD` against the change (`git stash push` the files). Tear extras down with `delete_league` before `seed.mjs down`. Scratch-league writes via service role are fine; a waivers league needs `waiver_claim_method` set with `waiver_mode`.
- **Container memory is tight** (~8 GB, swap full from other tenants/VS Code): `next dev` compiles take minutes and `networkidle` times out. Use `next build` + `next start` for browser checks; `rm -rf .next` after building a temp route (stale types break tsc). Kill servers with `kill $(pgrep -f "^next-server")`, never `pkill -f "next dev"`. Playwright `page.clock.install()` + `runFor` steps 20s intervals. A `pgrep -f` wait loop on your own script name matches the shell itself. A full `vitest run` can fail spuriously under memory pressure; re-run.
- **Vitest doesn't resolve `@/`**: modules imported by tests use relative imports (that is why `draftManagerScoresForNight` lives in `draft-scores.ts`, not the data module).
- **Curtain Call lock** (settled 2026-10-07): per-league coast + signed offset, capped at the broadcast's end; Grand Finale deadline stays East. See CLAUDE.md.
- **Direct writes past the pick lock are blocked by the safety policy.** For one-off fixes to real data, hand the user a guarded `.sql` block for the Dashboard SQL Editor.
- **Guest judges / scaling** (settled 2026-10-13): guests per episode on Schedule; fantasy judges points on a 3-judge basis; Curtain Call top scorer stays raw. Multi-dance nights not normalized (BACKLOG calibration item).
- **Dependency audit** (settled 2026-10-13): leave Next's bundled `postcss@8.4.31`; `@capacitor/cli` ^7 vs ^8 left alone (ask first, iOS session owns `cap sync`).
- **Handoff skills:** `sync-handoff` / `resume-handoff` are account-level skills with synced copies under `~/.claude/skills/synced/`; they run through the Skill tool. Don't re-add repo copies under `.claude/`; cleanup of local copies requires asking (memory note `local-handoff-skills`).
- **Curtain Call partial credit**: two hardcoded bands (25/10), no more.
- **Retroactive scoring changes**: `scripts/recompute-published-weeks.ts` after deploying the engine change.
- **Ad-hoc scripts**: run from the project root with `NODE_OPTIONS=--experimental-websocket`; TS with top-level await must be `.mts` (`npx tsx --env-file=.env.local`). Service role can't execute `active_season_id()`/`prediction_lock_at()`.
- **Type regen**: `set -a; . ./.env.local; set +a`, then the CLAUDE.md command into a temp file and diff.
- **gh CLI**: `GH_TOKEN` from the VS Code git credential helper per command (`git credential fill`); never persist it. The `gh auth git-credential ... not found` lines on git push are harmless noise.
- **Git**: `git pull --rebase --autostash`; stage by name; never `git add -A`.
- **`BACKLOG.md` edits**: `Edit` or a targeted script, never `Write`.

## 4. Backlog & Next Steps
- **E07 live night (Tue Oct 20 ET):** re-check Home/Results/Picks/Standings and the switcher with a released draft and a live-revealed couple; watch Home's refresh and the draft-night standings; confirm Score History shows `Jdg 36→27`-style lines on a guest night (BACKLOG "To check").
- Confirm Vercel is Ready for `74035c0`.
- Everything else deferred (browser checks, design follow-ups, calibration) is in BACKLOG.md.

Next command: none pending.
