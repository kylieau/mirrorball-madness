# Session Handoff

## 1. Current State
**Performance audit (BACKLOG.md "Performance audit — 2026-10-14"): fixes #1 and #2 are committed and pushed to `origin/main`; #3 not started.** Branch `main`, at `b7ccdea` before this sync. Vercel deploy not yet confirmed for either.
- **#1 `82fea94`**: flattened serial query waterfalls (`league-home-summary.ts` 5 rounds → 2, Picks in two parallel stages, Results one `Promise.all`, `loadRevealingWeek` alongside the cutoff). Verified during the live E06 reveal: signed-in SSR HTML identical before/after across 28 page/state pairs (including open and locked picks, Grand Finale on/off, Spoiler-Free states, drafts unlocked); dev medians Home 2.7 → 2.2s, Picks 3.6 → 3.0s.
- **#2 `fc08b22`**: per-request `React.cache` loaders in `src/lib/viewer-season-data.ts` (active season, spoiler progress with both marks, weeks/episodes, viewer memberships, all couples), reused by the draft context, spoiler cutoff, account settings, other-league picks, module stack and the Home/Results/league/Score History loaders. Draft context and roster reads overlap the cutoff. HTML identical across 28 pairs; dev medians Picks 3.2 → 2.2s, Standings 1.9 → 1.3s, Home unchanged. **Gap:** tested after E06 was published (05:01 UTC), so it had no revealing week, no released drafts and no open picks. Re-check on E07's live night.
- Build, `eslint src` and 609 tests pass. Full `npm run lint`/`npm test` fail only on another session's `.codex-private/` folder.
- **E06 is officially published** (2026-10-14 05:01 UTC). Its 11 live `dance_scores` rows have 4 judges each and `scaled_score` = total × 3/4, so guest-judge scaling is verified in the stored data.
- The earlier `384f78d` work (atomic publication, autosave fix, redirect validation, spacing pass) is pushed; the atomic publication migration is installed live. Whether E06's publish ran on a deploy with the atomic path wasn't checked.

## 2. Changes Made
This session: `src/lib/viewer-season-data.ts` (new), `league-home-summary.ts`, `league-page-data.ts`, `home-league-data.ts`, `revealing-week-data.ts`, `score-history-data.ts`, `draft-scores-data.ts`, `spoiler-cutoff.ts`, `account-settings-data.ts`, `other-league-picks.ts`, `league-module-stack-data.ts`, `src/app/(fan)/page.tsx`, `src/app/this-week/page.tsx`, Picks `page.tsx`, plus BACKLOG.md, CLAUDE.md (page-loader convention now names `viewer-season-data.ts`) and this file. All committed and pushed. Scratch QA leagues/accounts were removed; temp scripts deleted.

**Not ours; leave unstaged:** `.devcontainer/devcontainer.json`, `.devcontainer/Dockerfile.codex`, `.devcontainer/devcontainer-lock.json`, `.gitignore` (adds `/.codex-private/`), `ios/App/App.xcodeproj/project.pbxproj`, `supabase/queries/prefill-s35-e06-dances.sql`, `supabase/queries/add-bryan-s35-w05-curtain-call.sql` (both already run).

## 3. Key Decisions
- **No cross-request caching** for episodes, weeks, scores, results, predictions or spoiler progress (spoiler cutoff and reveal state depend on them; reads run under each viewer's RLS). `React.cache` per request only.
- **Perf verification method:** seed scratch league (`scripts/qa-screenshots/seed.mjs up`) + a second league via `create_league`; sign in with playwright; fetch SSR HTML with scripts/links stripped for each Spoiler-Free state; swap changed files to `HEAD` for "before". **Restart `next dev` fresh for each side**: repeated hot swaps grew next-server to 3.3 GB in this ~8 GB container and requests timed out. Kill it with `kill $(pgrep -f "^next-server")`; `pkill -f "next dev"` also kills the calling shell.
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
- **#3 (league-switcher summaries off the Picks/Standings critical path) waits on a user decision:** on a live night the switcher's rank can differ from Home's (`loadLeaguePageBase` doesn't pass `scoredIds`/`revealingWeekId`/`draftNight` to `computeLeagueHomeSummary`). Ask whether to align it with Home as part of #3. Details and other ride-along flags in BACKLOG.md.
- **E07 live night (Tue Oct 20 ET):** re-check #2 with a released draft and a live-revealed couple (Home, Results, Picks, Standings); also confirm Score History shows `Jdg 36→27`-style lines on a guest night (BACKLOG "To check").
- Confirm Vercel is Ready for `main` (first deploys with the perf changes and Next 15.5.27).
- Merged branch `fixes/finale-bonus-audit-schedule` is still on origin, safe to delete.

Next command: none pending. Ask the user the #3 rank-alignment question before starting it.
