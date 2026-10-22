# Session Handoff — 2026-10-22 (audit release shipped)

## 1. Current State

**The audit remediation is released and verified on production** (`dwts-fantasy-mirrorball-madness.vercel.app`).
- **Database:** all four `apply-audit-*.sql` scripts are applied live.
  - First, a combined dry run in one transaction, rolled back, against production. The rollback was verified.
  - Then the real run. Verified with the service role: the new columns exist, `update_scoring_categories_checked` is in place, and all 6 correction drafts are tagged.
- **App:** remote `main` was fast-forwarded to `997de1a` (Kylie approved the deploy explicitly), and Vercel deployed it.
- **Verified with throwaway accounts** (QA seed league, torn down; 0 leftover users):
  - League Settings loads;
  - revision-checked settings saves work, a stale revision is refused, and a member can't save;
  - members can't read invite codes, and the owner code and invite preview work;
  - a co-manager join works with the seven-day expiry;
  - a Curtain Call pick saves with `entered_via=app` and `pick_made_at`;
  - a non-admin can't make themselves a results contributor;
  - guest pages are unchanged.
- **Not yet observed:** a real publish, reveal and undo. That's E08, Tue Oct 27, 8 PM ET (2026-10-28 00:00 UTC).
- **Backup:** `~/Backups/mirrorball-before-audit.dump` on Kylie's Mac (Postgres 17.6, pg_dump 18.6). Not restore-tested.
- **No staging rehearsal.** Kylie has no free Supabase project slot.

**Repo:** this checkout is on `main`, tracking `origin/main`, and everything is pushed. That includes `5b46846` (regenerated `types.ts`; the two `mutate_draft_moment` calls cast their null args, like the backfill action) and `223dba6` (CLAUDE.md release status plus BACKLOG), which Kylie approved. The `audit-remediation-20261020` branch has nothing that isn't on `main`. It's kept as a record; delete it whenever.

## 2. Changes Made

This session's commits:
- `640d899`: devcontainer reinstalls the Codex plugin.
- `08f547e`: ignore `/.codex-private/`.
- `5035146`: keep the late Grand Finale pause.
- `997de1a`: handoff.
- `5b46846`: types.
- `223dba6`: release docs.
- This handoff.

All of them are on `main`.

**Not ours; leave unstaged:**
- `.devcontainer/devcontainer.json`: Kylie's machine-only Codex SSH setup. It mounts gitignored `.codex-private/` and sets `seccomp=unconfined`. Don't commit it as is.
- `.devcontainer/Dockerfile.codex`, `.devcontainer/devcontainer-lock.json`, `.agents/`, `AGENTS.md`
- `ios/App/App.xcodeproj/project.pbxproj`
- `supabase/queries/*.sql`

**Scratch files** (session scratchpad, disposable): `staging-structure.sql`, `audit-dry-run.sql`, `types-live.ts`.

## 3. Key Decisions
- **The late Grand Finale air-to-publish pause stays** (Kylie, 2026-10-21). It's now live. Still no deadline (CLAUDE.md Settled Decisions).
- **Rehearse SQL with a rolled-back transaction.** When there's no staging project, run a combined script (inner `begin`/`commit` stripped, wrapped in `begin; … rollback;`) in the production SQL Editor, then verify the rollback. This is better than PGlite alone, because it runs against real data.
- **A database release has an old-app gap.** Between the SQL and the deploy, the old app runs against the new database. In this release the gap broke League Settings: the `co_manager_invite_code` column grant and the revoke of the legacy settings RPC. Before running SQL, check `origin/main`'s reads and RPCs against each revoke, then have the build ready and push immediately after.
- **Deploy approval:** the auto-mode classifier blocks pushes to `main` (production deploy) without the user's explicit yes in that turn.
- **Kylie's instructions must say where:** which machine, app, Dashboard project or menu (memory `feedback-say-where-to-run`).
- **Secrets:** Kylie pasted the database password once. It's been reset. Never ask for the DB URL or password, only for command output.
- **Live safety** (unchanged):
  - throwaway accounts only, torn down in `finally`;
  - never fake releases or live `dance_scores`;
  - production publish checks observe a real night.
- **Tooling:**
  - Run ad-hoc Supabase/PGlite scripts from the project root as `node --input-type=module - <<'EOF'`.
  - Run one production build at a time. A `next/font` "reading '1'" build failure was a transient Google Fonts fetch: retry it.
  - Run tests as `npx vitest run src`, which avoids `.codex-private/`.
  - Never `pkill -f` your own pattern.
  - Stage by name.
  - Attribution: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## 4. Backlog & Next Steps
Deferred items are in BACKLOG under "Audit remediation — 2026-10-20".

**Kylie:**
- approve Results Contributors at `/admin/accounts` before E08;
- reissue her `#supportSWEKylie` co-manager code if wanted;
- DATA-8 backfills, repo visibility, SMTP, recurring backups and a restore test.

**E08 (Oct 27):**
- observe publish, live reveal and undo;
- re-check Home, Results, Picks, Standings and the switcher with a released draft and a live-revealed couple (missed on E07).

Next command: none pending. Next work is E08 night.
