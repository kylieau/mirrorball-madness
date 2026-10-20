# Session Handoff — remediation, 2026-10-20

## Latest (Claude, 2026-10-20 evening): read this first

- **Remote `main` is `c6d73e4`**: the spoiler patch `ce6fc3d` plus guest browsing.
  Both are deployed and verified in production (details in BACKLOG "Audit
  remediation").
- **Guest browsing** (`c6d73e4`, approved by Kylie to release before E07):
  - Signed-out visitors see Home and every published week on Results.
  - `/picks` and `/standings` show a sign-in card.
  - The anon grants are live (`supabase/apply-guest-browsing.sql`, run by Kylie).
  - See CLAUDE.md "Guest browsing".
- **This branch has `main` merged in** (`e4f1764`).
  - Only `schema.sql` conflicted, and both sections were kept.
  - Merged branch: tsc, `eslint src`, 643 tests and a production build pass.
  - The runbook says the guest grants are already live and need a post-deploy
    signed-out check.
  - The branch is still local only; don't push it before its migrations.
- **E07 draft prefilled live:** 10 dances and songs, no scores
  (`supabase/queries/prefill-s35-e07-dances.sql`, untracked like E06's).
- **Open:**
  - Kylie's phone check of guest browsing.
  - The two open late Grand Finale unlocks are hers to close or keep.
  - The local `main` branch is stale (behind origin); harmless.

## Current state and authorization

Kylie approved the recommendations after `682afc7` (“let's go with all your
recommendations”). This supersedes the older wait-for-selection instructions
below. Continue on `audit-remediation-20261020`; its broader commits are local.
Remote main has only the spoiler patch and guest browsing (see Latest).

- `ce6fc3d` isolates SEC-3/BE-2: viewer draft summaries and fail-closed spoiler
  preferences. Also available as local branch `audit-spoiler-protection`.
- Broader changes implement transactional draft/correction/reveal writes,
  explicit results contributors, invitation privacy/expiry, deadline preservation,
  settings concurrency, prediction provenance, multi-night scoring fixes,
  prediction cancellation/retry, editor navigation, auth continuation and recovery.
- See `docs/audit-remediation.md` for coverage/limits and
  `docs/audit-release-runbook.md` for activation. Four SQL files are prepared;
  **none applied live**. Deploy the broad changes only after their migrations,
  outside E07 live scoring. Regenerate the prepared Supabase types afterward.
- Auth redirect allow-list hardening was applied and verified. Custom SMTP is
  absent; owner answered “idk”. Email sends/changes remain gated off.
- No historical picks, standings, or correction drafts were modified live.
  Backfill provenance still requires owner confirmation. Never run recompute
  as part of this rollout. West-coast policy and scoring exemptions remain.
- No DB URL/password or pg_dump: backup tooling and restore procedure prepared,
  but no backup, restore rehearsal or scheduled job completed.
- Kylie explicitly approved pushing only `ce6fc3d` after the initial automatic
  approval rejection. Push succeeded; remote `origin/main` was verified at
  `ce6fc3d2195fe03466c6875850573be8ffbbab1a`. Production deployment since verified (see Latest).
  Remote: `https://github.com/kylieau/mirrorball-madness.git`.
- Broader remediation `4d17bee` remains local on `audit-remediation-20261020`;
  do not push/deploy it before the coordinated database release.

## Claude continuation — start here

Latest owner request: sync this handoff so work can continue in Claude. The
previous “sure” authorized **only** `ce6fc3d` to main; that push is complete.
It did not authorize pushing the broader branch before its release prerequisites.
`0112fd5` records that push; this documentation sync follows it. Remote main was
rechecked during this sync and remains exactly `ce6fc3d`.

1. Read `CLAUDE.md`, `docs/audit-remediation.md` and
   `docs/audit-release-runbook.md`. The audit reports describe the old reviewed
   revision; reconcile them with the implemented fixes before raising old claims.
2. Verify Vercel deployed `ce6fc3d`. A successful git push is the only deployment
   evidence so far. Check Scores/Schedule HTML/RSC payloads and fail-closed
   preference behavior using controlled fixtures/accounts; physical iOS is separate.
3. Arrange a private database backup, archive verification and a restore rehearsal
   on a separate project. No DB connection URL/client is available here. The
   service-role API is not a replacement for a complete backup. No backup exists
   from this session; no recurring job was created.
4. Rehearse the broad release on staging with disposable data first. Confirm no
   live scoring is in progress before any production migration. SQL order:
   `apply-audit-security.sql` → `apply-audit-deadlines.sql` →
   `apply-audit-settings.sql` → `apply-audit-prediction-provenance.sql` (all under
   `supabase/`). Use the owner's Dashboard workflow. Regenerate Supabase types,
   compare the prepared contracts, then coordinate the matching app deployment.
   Do not deploy `4d17bee` or this branch against the old production schema.
5. Explicitly approve global results contributors after rollout. Old pending
   co-manager codes become invalid; new ones expire in seven days. Accepted
   co-managers persist. Verify contributor/admin permissions, invite privacy and
   redemption, settings conflicts, picks/reload, correction and reveal/undo.
6. SMTP remains absent; keep `AUTH_EMAIL_ENABLED=false` and existing autoconfirm
   unchanged. Configure/verify delivery and templates before enabling confirmation,
   recovery or email changes. No emails or identity resets were sent.
7. Ask the owner to confirm DATA-8 historical backfill intent separately. No
   historical pick deletion or standings recompute is part of this release.

All 14 Chromium component checks passed with zero page errors. Temporary browser
fixture/screenshots: `/tmp/dwts-remediation-browser-1hzs68r6`. Full isolated build:
`/tmp/dwts-full-remediation-build-rm1hphvf`; small-patch build:
`/tmp/dwts-spoiler-build-rp3u66oe`. These are local evidence, not deployed services;
no review servers remain running. Avoid running heavy checks alongside other
Claude sessions. Preserve the unrelated files listed below; do not use `git add -A`.

## Verification and outstanding checks

App lint (excluding pre-existing `.codex-private` tool backups), TypeScript and
642 tests across 59 files passed. Both SEC-3/BE-2 and the full remediation
production builds passed in isolated worktrees with synthetic credentials and
one worker. Chromium component coverage and its limits are recorded in
`docs/audit-remediation.md`.
Browser checks use mocked actions and synthetic data: they do not establish
live SMTP, Realtime, native iOS, cross-device sync or a staging migration.
No real users were contacted or created. Production activation requires the
runbook's backup, staging smoke checks and explicit contributor approvals.

Unrelated devcontainer, .gitignore, iOS project and one-off query SQL edits
listed in the prior handoff remain untouched and unstaged.

---

# Previous session record (historical; superseded where noted)

## 1. Current State
**The full read-only audit is done, committed and pushed. Nothing from it has been fixed: Kylie decides first.** Branch `main`, in sync with `origin/main` after this sync commit.

**Commits this session:**
- **`d1acace`: UX audit polish S2, N2, N4.**
  - `PageSkeleton` loading states for League Settings, draft, waivers, Settings, Notifications and Manage Leagues. Manage Leagues moved to `src/app/leagues/(manage)/`.
  - Admin deliberately has no skeleton.
  - The fan tab bar is a `Main` nav landmark with `aria-current` and sits after the content on Picks and Standings.
  - Reduced-motion CSS.
- **`150630f`:** `docs/audit-summary.md` plus five area reports (security, data integrity, backend, operations, frontend): 113 verified findings, 2 dropped.

**Verified for `d1acace`:**
- Production builds of HEAD (baseline worktree) and the polish.
- Fan tabs and Manage Leagues pixel-identical at 360/390px. The only difference was Standings' random empty-league tagline.
- DOM checks for the landmark and `aria-current`.
- Under Reduce Motion, sheets and the accordion open and close fully.
- Under throttled network, the League Settings skeleton shows.
- `eslint src` and 612 tests pass. One run had memory-pressure timeouts; the rerun was clean.

**Not verified:**
- The Vercel deploy of `d1acace`/`150630f`. `gh` isn't authenticated in the container, so check the dashboard.
- The phone checks: gear skeleton, Reduce Motion.

**The audit:**
- The workflow hit the session limit four times. It finished by carrying finished results forward inside the script (`audit-cached.js` in the session scratchpad).
- I wrote `audit-summary.md` myself after the summary agent was cut off. The findings are verifier-checked; the ranking is mine.
- Every live throwaway account and league was confirmed deleted.

Next live night: **E07 (Week 6), Tue Oct 20, 8 PM ET** (2026-10-21 00:00 UTC).

## 2. Changes Made
Everything from this session is committed and pushed. This sync touches only `MEMORY_HANDOFF.md` and `BACKLOG.md`, where I added "Open decisions from the full audit — 2026-10-20" at the top.

**Not ours; leave unstaged:**
- `.devcontainer/devcontainer.json`
- `.devcontainer/Dockerfile.codex`
- `.devcontainer/devcontainer-lock.json`
- `.gitignore`
- `ios/App/App.xcodeproj/project.pbxproj`
- `supabase/queries/prefill-s35-e06-dances.sql`
- `supabase/queries/add-bryan-s35-w05-curtain-call.sql`

## 3. Key Decisions
- **The GitHub repo `kylieau/mirrorball-madness` is public** (checked with an unauthenticated API call, which returned 200). Anything pushed is world-readable, the audit reports included. Making it private is Kylie's call; don't change repo settings.
- **Don't fix audit findings until Kylie picks.** The tonight-relevant code fixes (SEC-3 draft leak, BE-2 Spoiler-Free fail-open) were offered as one separate deploy and are awaiting a yes.
- **Admin has no `loading.tsx` on purpose.** Enter Results' unmount cancels a pending 1.5s autosave instead of flushing it (`results-form.tsx`), so an instant skeleton would drop edits. Fix that after E07 (BACKLOG), then admin can get `PageSkeleton`.
- **The current fan tab stays a `<span aria-current="page">`, not a link,** so tapping it doesn't reload the page or drop `?week=`. The code review flagged that it isn't Tab-focusable; accepted.
- **Reduced motion uses near-zero durations, not `animation: none`,** because Base UI waits for sheet and dialog exit animations before unmounting.
- **A `loading.tsx` covers every route below it.** Pages with child routes get a route group (`(fan)`, `leagues/(manage)`). Never add `leagues/loading.tsx` or `leagues/[id]/loading.tsx`: they would replace the Picks/Standings skeleton. Recorded in CLAUDE.md.
- **Workflow lessons:**
  - Resume caches only the unchanged prefix of agent starts, and parallel pipelines reorder them. Carry finished results forward explicitly instead.
  - A failed verifier must stop its area, not count as "refuted".
  - The workflow size guideline is now `medium` in `~/.claude/settings.json` (Kylie's choice; it was briefly `large`).
- **QA method:**
  - Build in a `git worktree` of HEAD with `node_modules` symlinked for the baseline, alongside the working tree, and serve them on ports 3001 and 3000.
  - Throttle with CDP to observe skeletons.
  - Never run `pkill -f "next start"`: it kills the shell running it. Use `kill $(pgrep -f "^next-server")`.
  - Builds need about 1.5 GB free and can't run alongside a heavy workflow.
- **Unchanged from before:**
  - Look A is the one fixed look.
  - Settings "I last watched" stays unlocked mid-East.
  - Button hit areas live in the primitive.
  - Error text is `text-danger-text` with `role="alert"`.
  - The invite-preview tradeoff is accepted.
  - Forgot password is blocked on SMTP; the auth `useActionState` rewrite comes after E07 as its own deploy.
  - Live-data safety: no faked releases or `dance_scores`, and never select a week on Enter Results as a scratch user.
  - Supabase `mirrorball-madness` (`wssbwgtsejamlbvfofvu`) vs `fan-friction`.
  - Attribution: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - No cross-request caching; partial credit is 25/10 only; guest-judge scaling.
  - Ad-hoc scripts run from the project root with `NODE_OPTIONS=--experimental-websocket`.
  - git: `pull --rebase --autostash`, stage by name, edit `BACKLOG.md` with Edit; the handoff skills are account-level.

## 4. Backlog & Next Steps
**Waiting on Kylie:** see BACKLOG "Open decisions from the full audit — 2026-10-20":
- whether to make the repo private;
- her pre-show steps: auth allow-list cleanup, DB dump, the two open late Grand Finale unlocks;
- whether to deploy SEC-3 + BE-2 before the show;
- the DATA-8 backfill confirmation;
- rulings on the settled-decision conflicts;
- the order of audit fixes;
- whether she wants a review-gate hook.

**E07 live night:**
- re-check Home, Results, Picks, Standings and the switcher with a released draft and a live-revealed couple;
- Score History `Jdg 36→27`;
- the per-couple row and the ⓘ focus ring on her phone;
- the new skeleton and Reduce Motion checks.

**After E07** (BACKLOG):
- the Enter Results autosave-on-unmount fix;
- the auth `useActionState` rewrite;
- audit fixes in the order she picks;
- forgot password once SMTP is connected;
- the remaining UX audit items: A5, V3, V4, T2, T3, N1, C3.

Next command: none pending (waiting on Kylie's decisions).
