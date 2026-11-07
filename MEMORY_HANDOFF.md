# Session Handoff — 2026-11-07 (Dance Card v2 live in all four leagues)

## 1. Current State

**Dance Card v2 is live in all four Season 35 leagues.** `main` is at `a4127d4` (plus this sync), pushed. Vercel deployed the merge (`ab0fc98`, success).
- `supabase/apply-dance-card-v2.sql` is applied and verified. Anon is refused on the switch RPC and the archive.
- Types were regenerated from the live project. The Management API works; the old note saying it was blocked was wrong.
- The v1 browser check on the new code passed before switching: Home, Picks, Standings with Score History open, the couple page and League Settings.
- The switch, with commissioners agreed per Kylie, covered Pen & Paso, matt with the stars, #supportSWEKylie and Carrie Ann's Biggest Fans. Each ran `scripts/dance-card-v2.ts --apply` with actor `d40ab813-6763-4ebe-ba83-72c99ec6750b` (Kylie).
- `--verify` matches in all four. Live totals equal the dry run, and Curtain Call and Grand Finale are unchanged on all 175 archived rows.
- The one rank change: Carrie Ann's Biggest Fans, Kylie Au 888.30 now ahead of balla 882.02.

**Not yet done** (the new-league default SQL is applied):
- Nobody has looked at the v2 screens in a browser yet. Kylie checks on her phone.
- E10 (Week 9, Grammy Night, **Tue 2026-11-10 8pm ET**) is the first live v2 publish. It was rehearsed in `src/lib/dance-card-v2-night-db.test.ts`.

Design and rule are in `docs/design/dance-card-v2/`. The private review artifact with league tables is https://claude.ai/artifact/KyfrJ83pB3WBuTB5b3cudn. The `dance-card-v2` branch is merged and can be deleted.

## 2. Changes Made

All committed and pushed on `main`. This sync touches only `MEMORY_HANDOFF.md`.

**Not ours; leave unstaged:**
- `.devcontainer/devcontainer.json`, `.devcontainer/Dockerfile.codex`, `.devcontainer/devcontainer-lock.json`
- `.agents/`, `AGENTS.md`
- `ios/App/App.xcodeproj/project.pbxproj`
- `supabase/queries/add-*.sql`, `supabase/queries/prefill-*.sql`

`npm run lint` errors come from `.codex-private/` (not ours); `npx eslint src scripts` is clean. 895 tests pass.

## 3. Key Decisions

- **Dance Card v2 (Kylie, 2026-11-07):**
  - Season 35, switched before E10, commissioners agreed.
  - k₂ = 0.8884, from the schedule model. p = 0.80. The Fantasy Bonus is inside S, and each night keeps paying its own night.
  - Score History keeps v1's wording with the week's effective rate (`Harry: Jdg 30 × 0.257`); Kylie: v2 changes the numbers, not the copy. The Fantasy Bonus header is unchanged.
  - I told her plainly that v2 is "defensible and consistent", not "most fair". My lean was Season 36 and the advisor agreed; she chose Season 35.
- **v2 mechanics to keep:**
  - One ledger (`danceCardLedger`, integer cents).
  - Corrections update later weeks atomically through `commit_episode_publication_with_later_weeks`.
  - The version-4 gate and reveal order guard live in `assert_special_dance_plan`.
  - Switches go only through `set_dance_card_points`, with a revision check and exact coverage, and are refused mid-night.
  - Rollback is a v1 recompute. The archive is for audit only.
  - The Anchor Week is held once a v2 league has scores.
- **Repo is public:** never commit league standings or member names.
- **Carried over:**
  - SQL ships before the app.
  - A push to `main` needs Kylie's yes in that turn (handoff syncs excepted).
  - Render-check with throwaway accounts (`scripts/qa-screenshots/seed.mjs up|down`).
  - Stage by name. Never `pkill -f`. `rm -rf .next` before `npm run dev` after a build. Don't run prettier.

## 4. Backlog & Next Steps

See BACKLOG "Dance Card v2 rollout — 2026-11-07" and "Still to see on a real night (E10…)".

**E10 night:**
- Watch the usual list: the West-feed guard, Winner's Bonus and Winner/Loser, marks surviving a switch, blockers, the strike-through, the couple page "posting live", a loser's "+0".
- Watch the v2 credits too. Score History rates now vary week to week (front-loaded).
- **If Finish Week fails mid-night**, a switched league can't go back to v1 while scores are posting. Un-post every couple, then `--rollback`.

Afterwards: `--verify`, then runbook step 8.

Next command (after E10 publishes): `NODE_OPTIONS=--experimental-websocket npx tsx --env-file=.env.local scripts/dance-card-v2.ts --verify`
