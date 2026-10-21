# Session Handoff — 2026-10-21 (after E07)

## 1. Current State

**Two lines of work. Keep them apart.**

**A. Live on production: remote `main` at `5029676`.** Everything below is deployed and verified on `dwts-fantasy-mirrorball-madness.vercel.app`.
- **`ce6fc3d` spoiler patch:**
  - Scores and Schedule send only draft summaries.
  - Spoiler-Free fails closed on a profile read error. That half is unit-tested only.
- **`c6d73e4` guest browsing:**
  - `apply-guest-browsing.sql` is applied live.
  - Codex adversarial review: approve, no material findings.
  - Re-checked 2026-10-21 after E07 was published, signed out:
    - Home shows That's a Wrap, Play Along and E07 activity.
    - Results shows Week 6 — Dedication Night.
    - `/picks` and `/standings` show their sign-in cards.
    - No page errors.
  - Anon database probe: published scores and results only. Draft tables, `visible_draft_dance_scores`, and all league, profile, prediction and standings tables are denied.
- **`352e386` + `5029676` Curtain Call admin backfill:**
  - Record a Pick refuses a pick time at or after the lock (from the Codex review).
  - Both SQL files are applied live.
- **`e2ca87f` service-role grants:** applied live. Codex review found no issues.
- **E07 (Week 6) was published at 2026-10-21 05:01 UTC.** The planned mid-broadcast re-check with a released draft and a live-revealed couple was missed, because the reviews were still running. Redo it on E08, Tue Oct 27, 8 PM ET (2026-10-28 00:00 UTC).

**B. Not deployed: local branch `audit-remediation-20261020` at the handoff commit, on top of `5035146`.**
- Contents:
  - the broad audit fixes (`4d17bee`);
  - `main` merged in through `9f6887b`;
  - this session's commits: `640d899` (devcontainer reinstalls the Codex Claude Code plugin), `08f547e` (ignore `/.codex-private/`) and `5035146` (docs for the late Grand Finale pause decision).
- No upstream, never pushed. **Don't push or deploy it** until its four migrations go in per `docs/audit-release-runbook.md`, which exists only on this branch.
- The release is ready to start, but every remaining step needs Kylie (see section 4).
- Pre-release check done: open correction drafts exist for E1 and E3–E7. All match live data exactly, so they're leftovers from viewing published weeks, not pending edits. `apply-audit-security.sql` tags and keeps them.

## 2. Changes Made

All work is committed. This session's files: `.devcontainer/devcontainer.json` (`postCreateCommand` line only, staged via the index), `.gitignore`, `CLAUDE.md`, `BACKLOG.md`, `MEMORY_HANDOFF.md`.

**Not ours; leave unstaged:**
- `.devcontainer/devcontainer.json`: Kylie's machine-only Codex SSH setup. Its mounts read gitignored `.codex-private/`, so a fresh clone wouldn't start. It also sets `seccomp=unconfined`. Recommended: never commit it as is.
- `.devcontainer/Dockerfile.codex`, `.devcontainer/devcontainer-lock.json`, `.agents/`, `AGENTS.md`
- `ios/App/App.xcodeproj/project.pbxproj`
- `supabase/queries/*.sql` (E06/E07 prefills, Bryan's W05 pick)

**Tooling:** the Codex plugin (`codex@openai-codex` 1.0.6) is installed at user scope. `/codex:review` is user-only and reviews branches. To review a single commit, Claude runs `node <plugin>/scripts/codex-companion.mjs review|adversarial-review --wait --base <sha>^ --scope branch` in a scratch worktree of that commit.

## 3. Key Decisions
- **The late Grand Finale air-to-publish pause stays** (Kylie, 2026-10-21). `apply-audit-deadlines.sql` refuses a late submit while any week has aired and is unpublished. It's not a deadline, and there's still no deadline. Recorded in CLAUDE.md Settled Decisions.
- **Kylie approved all audit recommendations.** Ship them only through the runbook's coordinated release, outside live scoring.
- **When merging `main` into the branch:** keep the branch's single `admin_backfill_prediction` and its hand-written `types.ts` entry; don't take main's duplicates.
- **Live safety:**
  - throwaway accounts only, deleted in `finally`;
  - never fake releases or live `dance_scores`;
  - never select a week on Enter Results as a scratch user;
  - production publish checks observe a real night.
- **Never `pkill -f` a pattern that appears in your own command line.** Use `kill $(pgrep -f "^next-server")`.
- **Tooling:**
  - Ad-hoc Supabase scripts run inline from the project root (`node --input-type=module -e`), since a scratchpad file can't resolve `node_modules`.
  - Run one production build at a time.
- **Unchanged:**
  - SMTP is absent and `AUTH_EMAIL_ENABLED=false`;
  - no recompute or historical pick deletion;
  - stage by name;
  - attribution `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## 4. Backlog & Next Steps
Deferred items are in BACKLOG under "Audit remediation — 2026-10-20".

**The audit release (runbook) needs Kylie first:**
1. Staging rehearsal of the migration and app together, on a disposable Supabase project. Decide whether to stand one up.
2. A private backup on a trusted machine with `SUPABASE_DB_URL` and `pg_dump`: `node --env-file=.env.local scripts/backup-database.mjs <path>`, then `pg_restore --list`.
3. Apply in the Dashboard: `apply-audit-security.sql`, `apply-audit-deadlines.sql`, `apply-audit-settings.sql`, `apply-audit-prediction-provenance.sql`. Then regenerate types, deploy, and approve Results Contributors.

Claude can verify after each SQL step with the service-role key.

**Other open items for Kylie:**
- phone check of guest browsing, signed out;
- DATA-8 backfills;
- repo visibility;
- SMTP.

**E08:** the live re-check of Home, Results, Picks, Standings and the switcher, with a released draft and a live-revealed couple.

Next command: none pending (waiting on Kylie's staging/backup decision).
