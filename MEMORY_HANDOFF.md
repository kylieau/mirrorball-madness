# Session Handoff — 2026-10-20 (evening, just before E07)

## 1. Current State

**Two lines of work. Keep them apart.**

**A. Live on production: remote `main` at `e2ca87f`. Each item is deployed and verified on `dwts-fantasy-mirrorball-madness.vercel.app`.**
- **`ce6fc3d` spoiler patch:**
  - Scores and Schedule send only draft summaries, verified with a throwaway account.
  - Spoiler-Free fails closed on a profile read error. That half is unit-tested only.
- **`c6d73e4` guest browsing:**
  - Signed-out visitors see Home and every published week on Results.
  - `/picks` and `/standings` show a sign-in card.
  - `apply-guest-browsing.sql` is applied live.
- **`352e386` Curtain Call admin backfill:**
  - League Settings → Curtain Call → Record a Pick, site admins only.
  - `apply-curtain-call-backfill.sql` is applied live: the four provenance columns and `admin_backfill_prediction`.
  - The types are regenerated.
- **`e2ca87f` service-role grants:**
  - EXECUTE on `active_season_id` and both deadline functions, so non-member site-admin League Settings works.
  - `apply-service-role-season-grants.sql` is applied live.
- **Also live, outside git:**
  - The E07 draft prefill: 10 dances and songs, no scores (`supabase/queries/prefill-s35-e07-dances.sql`, untracked like E06's).
  - The auth redirect allow-list hardening, done by an earlier session.

**B. Not deployed: local branch `audit-remediation-20261020` at `2fc0c31`.**
- It holds the broad audit fixes (`4d17bee`), with `main` merged in three times. The last merge brought in `e2ca87f`.
- On the merged branch, tsc, `eslint src` and 644 tests pass, and the production build succeeded at `e4f1764`.
- It has no upstream. **Don't push or deploy it** until its four migrations go in per `docs/audit-release-runbook.md`, which exists only on this branch. That means backup, staging rehearsal, and outside live scoring.
- This handoff and BACKLOG are copied to `main` as a docs-only commit so other devices see current state. `docs/audit-remediation.md` and the runbook stay branch-only.

**Next live night:** E07 (Week 6), Tue Oct 20, 8 PM ET (00:00 UTC).

## 2. Changes Made

All of today's work is committed. This sync touches only `MEMORY_HANDOFF.md` and `BACKLOG.md`, on the branch and copied to `main`.

**Not ours; leave unstaged:**
- `.devcontainer/devcontainer.json`
- `.devcontainer/Dockerfile.codex`
- `.devcontainer/devcontainer-lock.json`
- `.gitignore`
- `ios/App/App.xcodeproj/project.pbxproj`
- `supabase/queries/*.sql` (E06/E07 prefills, Bryan's W05 pick)

**Leftover worktrees from another session** (`/tmp/dwts-full-remediation-build-*`, `/tmp/dwts-spoiler-build-*`): harmless.

## 3. Key Decisions
- **Kylie approved all audit recommendations.** Ship them only through the runbook's coordinated release.
- **Releasing before E07 (her call):**
  - the spoiler patch, guest browsing, the Curtain Call backfill and the grants;
  - each built from `main` on its own worktree branch;
  - each verified on production;
  - then `main` merged into the remediation branch.
- **Grand Finale late unlocks have no deadline.** Settled in CLAUDE.md, with the curtain-to-publish gap knowingly accepted.
  - **Open:** the branch's `apply-audit-deadlines.sql` pauses late submits between air and publish. Kylie decides whether to keep that before release (BACKLOG).
- **Guest browsing scope:** published weeks only; no live reveal, drafts or league data. Picks and Standings placeholders lead with Sign In. Guests reuse the signed-out `SiteHeader`, pinned.
- **Curtain Call:**
  - no late-unlock window;
  - site-admin backfill with provenance is the only way in after the lock;
  - a backfill for a published week changes points only on the next publish.
- **When merging `main` into the branch:**
  - keep the branch's single `admin_backfill_prediction` definition in `schema.sql`;
  - keep the branch's hand-written `types.ts` entry;
  - don't take main's duplicate copies.
- **Live safety:**
  - throwaway accounts only, deleted in `finally`, confirmed with `find-audit-users`;
  - never fake releases or live `dance_scores`;
  - never select a week on Enter Results as a scratch user.
- **Never `pkill -f` a pattern that appears in your own command line.** It kills the shell; that happened twice today. Use `kill $(pgrep -f "^next-server")`.
- **Builds:** run one production build at a time (memory). Use a git worktree of `origin/main` with `node_modules` symlinked for main-based work.
- **Unchanged:**
  - SMTP is absent and `AUTH_EMAIL_ENABLED=false`;
  - no recompute or historical pick deletion;
  - stage by name;
  - attribution `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - the workflow size guideline is `medium`.

## 4. Backlog & Next Steps
All deferred items are in BACKLOG, under "Audit remediation — 2026-10-20" at the top. The main ones:
- **Kylie:**
  - the phone check of guest browsing, signed out;
  - whether to keep or remove the branch's late Grand Finale air-to-publish pause;
  - confirm the DATA-8 backfills;
  - whether to make the public repo private (the audit reports are public);
  - SMTP;
  - a backup with a DB URL and `pg_dump`.
- **E07 tonight:** re-check Home, Results, Picks, Standings and the switcher with a released draft and a live-revealed couple; Score History `Jdg 36→27`; guest pages after publish.
- **Suggested next:** a Codex review of `c6d73e4` (most important: it opens data to `anon`), `352e386` and `e2ca87f`. Act on findings after E07 unless they're critical.
- **After E07:** the coordinated audit release per the runbook.

Next command: none pending (Codex review is Kylie's to start).
