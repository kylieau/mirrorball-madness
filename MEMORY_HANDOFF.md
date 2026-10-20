# Session Handoff — remediation, 2026-10-20

## Current state and authorization

Kylie approved the recommendations after `682afc7` (“let's go with all your
recommendations”). This supersedes the older wait-for-selection instructions
below. Work is on `audit-remediation-20261020`, locally only.

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
- A push of only `ce6fc3d` to `origin/main` was rejected by automatic approval
  review because it may deploy production. **No push or deployment occurred.**
  Exact push approval remains pending. Remote is
  `https://github.com/kylieau/mirrorball-madness.git`; main remains `682afc7`.

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
