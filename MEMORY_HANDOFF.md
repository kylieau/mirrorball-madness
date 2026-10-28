# Session Handoff — 2026-10-27 (E08 night, mid-broadcast)

## 1. Current State

**E08 (Week 7, Horror Movie Night) is airing tonight and is not published yet.** `main` is at `bb49e05`, pushed (production deploy).

Done tonight:
- **Week 7 is flagged as a double elimination** (Kylie, on Schedule). ABC announced on air that two couples go home. Every manager who picked has both slots filled. Some teams never picked (Carrie Ann's: Guillermo fan club, arielle, balla, Ellery; matt with the stars: matt, Bryan, lorn; Pen & Paso: ChaChaSam; #supportSWEKylie: Jonathan Au).
- **Shirley Ballas is E08's guest judge** (an archived judge, so not on the standing panel). Enter Results shows 4 boxes; points still pay on `scaled_score`.
- **E08 dances and songs are prefilled as drafts** (`supabase/queries/prefill-s35-e08-dances.sql`, run by Kylie, verified: 10 rows, one per couple, 0 judge scores, nothing released or live). Song titles carry the movie in parens, e.g. `Toxic (Saw)`.
- **`bb49e05`: commissioners can move the Curtain Call lock at any time.**
  - `supabase/apply-drop-curtain-call-lock-guard.sql` drops `guard_curtain_call_lock_edit`. Kylie ran it live and it succeeded.
  - League Settings asks the commissioner to confirm a change that reopens a locked week or locks an open week immediately (`pickLockFlip`, `src/lib/curtain-call-lock.ts`).
  - Verified: build, 648 tests, lint. The reopen dialog was checked in a browser on a scratch QA league (cancelled, swept: 0 QA accounts left). The lock-now dialog is unit-tested only.

## 2. Changes Made

All of the above is committed in `bb49e05` and pushed. This handoff and BACKLOG.md are the only other changes.

**Not ours; leave unstaged:**
- `.devcontainer/devcontainer.json`: Kylie's machine-only Codex SSH setup.
- `.devcontainer/Dockerfile.codex`, `.devcontainer/devcontainer-lock.json`, `.agents/`, `AGENTS.md`
- `ios/App/App.xcodeproj/project.pbxproj`
- `supabase/queries/*.sql`, including tonight's `prefill-s35-e08-dances.sql` (one-off query scripts stay uncommitted like E06/E07's).

## 3. Key Decisions
- **Curtain Call timing is the commissioner's call, any time** (Kylie, 2026-10-27). Reopening a locked week or locking an open one is allowed; the app only warns. A once-per-episode limit was considered and dropped. Don't re-add a server guard.
- **Double elimination flag:** flip `is_double_elimination_week` only when the double is announced, before the lock. A saved single pick keeps paying (slot 1 hits either eliminated couple); Home's picks-due check ignores slot 2, so tell managers to add a second pick.
- **Prefill format:** draft-only `draft_dance_scores` rows, skip couples that already have one; song title is `Song (Movie)`, no quotes.
- **Deploy approval:** a push to `main` deploys production and needs Kylie's explicit yes in that turn. The freeze lasts until E08 is published; Kylie approved `bb49e05` during it.
- **QA against production:** `seed.mjs` QA-domain accounts only, always finish with `seed.mjs sweep`. The Next dev badge covers the bottom-left Save button in headless runs; click it with `el.click()` via `evaluate`.
- **Production deletions:** hand Kylie a guarded `.sql` (exact-count `raise exception`); only `seed.mjs sweep` runs from here.
- **Ad-hoc service-role checks:** write the script at the project root (scratchpad dir may not exist), run with `.env.local` sourced and `NODE_OPTIONS=--experimental-websocket`, then delete it. `prediction_lock_at` returns null to the service role; compute locks from `leagues` columns instead.
- **Never `pkill -f`.** Stop a server by the pid from `ss -ltnp`.
- **Unchanged:** the late Grand Finale air-to-publish pause stays; rehearse SQL with a rolled-back transaction; never ask for the DB password; throwaway accounts only, never fake releases or `dance_scores`; run tests as `npx vitest run src`; stage by name; attribution `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Minor:** the `SUPABASE_ACCESS_TOKEN` in `.env.local` is expired (401), so type regeneration needs a fresh token.

## 4. Backlog & Next Steps
See BACKLOG "E08 night follow-ups — 2026-10-27", "First-user QA pass — 2026-10-22" and "Audit remediation — 2026-10-20".

**Tonight (Kylie):** enter E08 scores per `docs/audit-release-runbook.md` (draft releases, Publish/Undo/Un-Post), then after the West broadcast post every couple, mark the two eliminated couples in Finish Week and finish the week.

**Then Claude:** runbook step 8 with the service role:
- no `draft_*` rows or releases left for E08;
- one `weekly_manager_scores` row per team per league for Week 7;
- `results_published_at` set on E08;
- both eliminated couples' `couples.status` updated.

Next command: none pending. Wait for Kylie to say E08 is published, then run step 8.
