# Session Handoff — 2026-11-07 (Dance Card v2 built on a branch; main untouched for E10)

## 1. Current State

**`main` is at `77d0427` (plus this sync), pushed, and unchanged in code.** It is what E10 (Week 9, Grammy Night) publishes on, **Tuesday 2026-11-10, 8pm ET**. Kylie still needs to confirm Vercel shows `de90936` Ready.

**Dance Card v2 is built on branch `dance-card-v2`, pushed to `origin/dance-card-v2`, and not merged or deployed.** There are 10 commits after `77d0427`, ending at the "copy calls settled" docs commit. Nothing live has changed: no SQL applied and no league switched.
- The rule: a couple's season value is `round_cents(k_N × S^0.8)`, where S is its weekly inputs from the Anchor Week. Each week pays the change in that value. There are no survival or placement points. k₂ = 0.8884, and the Fantasy Bonus is inside S.
- Verified:
  - 894 Vitest tests pass, including PGlite rehearsals of the new SQL on the live stack.
  - Type-check, lint and `npm run build` pass.
  - A read-only production dry run reproduces the frozen analysis to the cent in all four leagues, and the v1-rebuild gate passes everywhere.
- Not verified:
  - Any v2 screen, which needs the SQL live.
  - The v1 browser check, which also has to wait for the SQL: Home and the couple page now select `dance_card_version`.
- Reviews: the plan passed the advisor and Codex (three rounds). Codex's implementation review found no P1 and no v1 scoring change. Its one P2 (two-night weeks still posting) is fixed for Score History, Standings and In Your Leagues, with tests.

**Read on the branch:** `docs/design/dance-card-v2/` (README, PLAN.md rev 3, frozen-rule.json, analysis scripts), the BACKLOG section "Dance Card v2 rollout — 2026-11-07", and the CLAUDE.md bullet "Dance Card v2". The full review with league tables is a private artifact: https://claude.ai/artifact/KyfrJ83pB3WBuTB5b3cudn (league tables stay out of the public repo).

## 2. Changes Made

On `main`, this sync touches only `MEMORY_HANDOFF.md`. All v2 work lives on `dance-card-v2`.

**Not ours; leave unstaged:**
- `.devcontainer/devcontainer.json`, `.devcontainer/Dockerfile.codex`, `.devcontainer/devcontainer-lock.json`
- `.agents/`, `AGENTS.md`
- `ios/App/App.xcodeproj/project.pbxproj`
- `supabase/queries/add-*.sql`, `supabase/queries/prefill-*.sql`

`npm run lint` errors come from `.codex-private/` (not ours); `npx eslint src` is clean. `git push` prints a harmless `gh: not found` warning.

## 3. Key Decisions

- **Dance Card v2, settled by Kylie, 2026-11-07:**
  - Applies to **Season 35**.
  - The rest follows the reviewer's leans: k from the schedule model (0.8884 for 2-couple rosters, 2/N-like by roster size); p = 0.80; Fantasy Bonus inside S; each night keeps paying its own night.
  - Each league's commissioner agrees and members are told before that league switches.
  - Nothing switches before E10 is published.
  - Score History line `Harry: Jdg 30 · Season 177.75`. The Fantasy Bonus header stays as is. The member explainer gets drafted from the post-E10 dry run.
- **v2 design choices to keep:**
  - One ledger (`danceCardLedger`, integer cents).
  - A correction to an earlier week updates later weeks atomically via `commit_episode_publication_with_later_weeks`, which wraps the unchanged live commit.
  - The version-4 gate and the reveal order guard live in `assert_special_dance_plan`.
  - Switches run only through `scripts/dance-card-v2.ts` and `set_dance_card_points`, with a revision check and exact coverage, and are refused mid-night.
  - Rollback is a v1 recompute; the archive is for audit only.
  - A v2 league's Anchor Week can't move once it has scores.
- **Repo is public:** never commit league standings or member names.
- **Carried over:**
  - Season track counts weeks.
  - West feed: guard, not mask.
  - Couple names link from league cards.
  - Naming rule A in app and SQL.
  - SQL ships before the app that reads it.
  - A push to `main` needs Kylie's yes in that turn (handoff syncs excepted).
  - Production reads go through service-role REST in throwaway scripts run from the project root.
  - Render-check with throwaway accounts (`scripts/qa-screenshots/seed.mjs up|down`).
  - Stage by name. Never `pkill -f`. `rm -rf .next` before `npm run dev` after a build. Don't run prettier.

## 4. Backlog & Next Steps

**E10 night (on `main`):** watch the list in BACKLOG "Still to see on a real night (E10…)" and "Episode rounds":
- the West-feed guard
- the Winner's Bonus and Winner/Loser flow
- special-dance marks surviving a page switch
- invalid-mark blockers and their new wording
- the Dance Card strike-through
- the couple page "posting live"
- a loser's "+0"

Afterwards, Kylie runs runbook step 8 for E10.

**Then Dance Card v2 rollout** (steps in the branch's BACKLOG section):
1. Dry-run with Week 9 included, and draft the member explainer.
2. Kylie gets commissioner consent.
3. Kylie applies `apply-dance-card-v2.sql`.
4. Verify the SQL, regenerate types, and merge.
5. Run the v1 browser check.
6. Kylie applies `apply-dance-card-v2-default.sql`.
7. `--apply` each consenting league between a publish and the next curtain, then `--verify`.

**After E10, for Kylie:** the roster timeline and holder-spoiler question.

Next command (after E10 is published): `git switch dance-card-v2 && NODE_OPTIONS=--experimental-websocket npx tsx --env-file=.env.local scripts/dance-card-v2.ts --dry-run`
