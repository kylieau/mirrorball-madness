# Session Handoff — 2026-10-22 (E08 prep, test-account cleanup)

## 1. Current State

**The audit remediation is released and verified on production** (`dwts-fantasy-mirrorball-madness.vercel.app`).
- All four `apply-audit-*.sql` scripts are live.
- The app is deployed and the types are regenerated (see the CLAUDE.md release status).
- **Not yet observed:** a real publish, reveal and undo. That's E08, Tue Oct 27, 8 PM ET (2026-10-28 00:00 UTC).

**This session:**
- **E08 checklist** added to `docs/audit-release-runbook.md` → "First live night after the release (E08)". Commit `22cd7ee`, pushed (docs-only deploy). It covers:
  - before the curtain;
  - East: draft release, Stay Updated, Publish/Undo/Un-Post;
  - after West: Finish Week, plus a service-role verification Claude runs;
  - what each publish error means.
- **E08 config checked read-only (service role):**
  - Week 7, Horror Movie Night, single elimination, the only episode that week;
  - 10 active couples, `expected_dance_count` 1, no guest judges;
  - no draft rows or releases for E08 yet.
- **Test accounts deleted from production.**
  - The 27 leftover `kylie.au+gf-…@lotuscollective.ai` accounts (Sep 27 Grand Finale late-unlock testing: 15 "Avery Quinn", 11 "Blake Nguyen", 1 "Still Shot") and 4 `cursor-home-…@example.com` accounts (Sep 28, the whole deletion queue).
  - None were in a league or referenced anywhere.
  - Kylie ran the `delete from auth.users` herself in the Dashboard SQL Editor, guarded by an exact-count check, because the auto-mode classifier blocked it.
  - Verified: 27 auth users = 27 profiles, 0 deletion requests, no league member missing.
  - Three real accounts are in no league (AR, Andreina, genamenyhart). Leave them.

**Repo:** `main` tracks `origin/main`. After this handoff commit, everything is pushed.

## 2. Changes Made

This session's commits:
- `22cd7ee`: runbook E08 checklist.
- This handoff, plus a `BACKLOG.md` update (late-entry item, contributor status, runbook pointer).

**Not ours; leave unstaged:**
- `.devcontainer/devcontainer.json`: Kylie's machine-only Codex SSH setup. It mounts gitignored `.codex-private/` and sets `seccomp=unconfined`. Don't commit it as is.
- `.devcontainer/Dockerfile.codex`, `.devcontainer/devcontainer-lock.json`, `.agents/`, `AGENTS.md`
- `ios/App/App.xcodeproj/project.pbxproj`
- `supabase/queries/*.sql`

## 3. Key Decisions
- **Production deletions:** the auto-mode classifier blocks irreversible deletes (auth users) even after Kylie's yes. Hand Kylie a guarded `.sql` block instead (exact-count `raise exception`, one transaction), then verify with the service role.
- **QA hygiene:** throwaway test accounts must be torn down in `finally`. The Sep 27 late-unlock scripts and a Cursor session didn't do this, which left 31 strays on the Accounts and Results Contributors lists.
- **`.env.local` has a stale `RESULTS_ENTRY_OPEN_TO_ALL`** that no code reads. It's harmless; mention it if `.env.example` is ever tidied.
- **The late Grand Finale air-to-publish pause stays** (Kylie, 2026-10-21). Still no deadline (CLAUDE.md Settled Decisions).
- **Rehearse SQL with a rolled-back transaction** when there's no staging project (Kylie has no free Supabase slot).
- **A database release has an old-app gap.** Check `origin/main`'s reads and RPCs against each revoke before running SQL, then deploy immediately after.
- **Deploy approval:** a push to `main` is a production deploy. It needs Kylie's explicit yes in that turn.
- **Kylie's instructions must say where:** which machine, app, Dashboard project or menu (memory `feedback-say-where-to-run`).
- **Secrets:** never ask for the DB URL or password, only for command output.
- **Live safety:**
  - throwaway accounts only, torn down in `finally`;
  - never fake releases or live `dance_scores`;
  - production publish checks observe a real night.
- **Tooling:**
  - Run ad-hoc Supabase scripts from the project root as `NODE_OPTIONS="--experimental-websocket" node --env-file=.env.local --input-type=module - <<'EOF'`.
  - Run one production build at a time. A `next/font` "reading '1'" failure is a transient fetch: retry it.
  - Run tests as `npx vitest run src`.
  - Never `pkill -f` your own pattern.
  - Stage by name.
  - Attribution: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## 4. Backlog & Next Steps
Deferred items are in BACKLOG under "Audit remediation — 2026-10-20".

**Kylie, this week** (she'll do these later in the week):
- approve any further Results Contributors at `/admin/accounts` (balla is approved, verified 2026-10-22);
- get Jonathan Au and arielle to submit their open Grand Finale late entries before 8 PM ET Oct 27, or close them;
- optionally, reissue her `#supportSWEKylie` co-manager code;
- later: DATA-8 backfills, repo visibility, SMTP, recurring backups and a restore test.

**E08 (Oct 27):** follow the runbook checklist. After Finish Week, Claude runs the service-role verification in its step 8.

Next command: none pending. Next work is E08 night.
