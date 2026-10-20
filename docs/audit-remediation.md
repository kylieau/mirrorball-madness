# Audit remediation — 2026-10-20

The owner approved the recommendations in the Codex review after handoff
`682afc7`. This supersedes the earlier instruction to wait for audit selections.
Unrelated devcontainer, iOS project, and one-off pick SQL changes remain untouched.

## Delivery boundaries

- Keep the pre-E07 deployment limited to draft-payload and spoiler-read fixes.
- Prepare database changes as reviewable SQL for the owner's Dashboard workflow.
- Do not alter historical picks or recompute standings without confirmed provenance.
- Do not enable email confirmation/recovery delivery until custom SMTP is verified.
- Preserve West-coast locks, intentional scoring exemptions, and legitimate corrections.

## Work packages

- [x] SEC-3 / BE-2: minimal viewer draft summaries and fail-closed preferences; test payloads and failures.
- [x] SEC-1: restrict auth redirect hosts, retaining web and native callbacks.
- [ ] OPS-4 activation: private backup, restore rehearsal and scheduled job. Tooling/procedure prepared; database connection and PostgreSQL client required.
- [x] SEC-2 implementation: owner-only invitation secrets and seven-day expiry. PostgreSQL grants/redemption verified; live API/Realtime retest pending.
- [x] DATA-1: server concurrency token and finite, representable settings validation.
- [x] BE-3/6/7: transactional draft replacement, correction seeding and completeness.
- [x] FE-3/4/8/18: saved predictions, cancellation, week changes, request recovery and labels.
- [x] FE-1/10: viewer-safe results and split-week spoiler protection.
- [x] BE-8/13/14: transactional reveal/undo and consistent standings.
- [x] OPS-3 implementation: confirmation-aware signup, recovery, disabled email-change UI and existing-account procedure. SMTP delivery/ownership review pending; sends remain disabled.
- [x] OPS-8: self-contained RLS and clean-schema permission tests.
- [x] DATA-2/3/7, SEC-6: established deadlines, late-entry window and self-unlock protection.
- [x] SEC-20/BE-25: explicitly trusted global results contributors.
- [x] FE-5/6/7: autopilot chaining, draft status freshness and stale settings protection.
- [x] FE-9/12: accurate previews and storage-key isolation.
- [x] DATA-4/10: correct multi-night scoring and correction order.
- [x] DATA-6, BE-11/22: Recast eligibility timing, claim locking and spoiler-safe history.
- [x] Pending editor navigation, auth invitation continuation, judge-score validation.
- [x] Local validation: lint, type check, unit/database regressions, isolated production builds and synthetic browser checks (evidence below).

## External prerequisites

Read-only auth configuration on 2026-10-20 confirmed custom SMTP is absent.
No database URL/password or `pg_dump` is available in the container. Prepare
backup tooling without representing an API data export as a complete database backup.

## Delivery status

`ce6fc3d` is the migration-free SEC-3/BE-2 patch, independently built and retained
on local branch `audit-spoiler-protection`. The broader local branch is
`audit-remediation-20261020`. Neither has been pushed or deployed. An attempted
push of only the small patch was rejected by automatic approval review because
main may trigger production deployment; exact push approval remains pending.
`origin/main` was `682afc7` when checked.

The one completed live change is SEC-1: the redirect allow-list now contains only
localhost, the two existing production Vercel hosts and the native callback.
A Management API read verified the new list. No other auth settings changed.
No database migrations, historical data edits, live scoring checks, recomputes,
external messages or new live QA accounts were performed.

## Validation — 2026-10-20

- `npm run lint -- --ignore-pattern '.codex-private/**'`: passed. Plain
  `npm run lint` scans pre-existing private tool backup copies and reports errors
  there; application/tooling sources are clean. The private copies were untouched.
- `npx tsc --noEmit --incremental false`: passed.
- `npm test`: **642 passed across 59 files**. Tests include 23 audit PostgreSQL
  regressions, 12 existing publication/rollback checks, auth continuation and
  spoiler-payload/preference failure checks. New schema loads independently;
  each prepared migration is applied twice in synthetic PGlite.
- Both production builds passed with synthetic credentials and one worker in
  separate temporary worktrees: `ce6fc3d` and the full remediation snapshot.
  Node 20 SDK deprecation and webpack cache warnings did not fail the builds.
- **14 Chromium checks passed with zero browser errors.** They exercised actual components with synthetic action responses and
  external requests blocked: saved-versus-unsaved prediction state, cancellation,
  save/retry, bracket reorder labels, keyed dismissal storage, chained autopilot,
  rejected autopilot recovery, retained auth email/invitation, editor flush before
  navigation, failed-save navigation/retry, by-couple hidden outcomes, mixed-night
  locking and locked See Picks links. Card width assertions/screenshots cover
  360px and 390px. These are component behavioral checks, not live integration
  or participant usability tests.
- `git diff --check` and operational script syntax checks passed.

## Behavior and limits

- Scores/Schedule serialize draft summaries, not unreleased songs, scores or
  outcomes. Hidden result rows are filtered server-side; the by-couple and
  mixed-night views apply the viewer cutoff. Profile read errors fail closed.
- Episode saves/correction seeding/reveal/undo/custom moments are transactional.
  Correction tokens reject stale ordinary saves; incomplete corrections cannot
  erase missing live couples. The publication snapshot uses a database token
  and includes affected week scores. Episode locks precede table locks.
- Explicit contributor approval replaces self-service league-commissioner access
  to season-wide results entry. Published correction remains admin-only.
- Existing expired Grand Finale deadlines survive schedule/anchor/draft-reset
  edits. Late submissions wait for aired unpublished weeks; self-unlock is denied.
  Recast claims serialize and determine their effective week when finalized.
- Settings revision checks reject stale forms. Finite/precision bounds reject
  values that cannot survive score calculation or serialization. New judge
  writes must be within 0–10; existing historical data is not rewritten.
- Multi-night scoring orders outcomes by TV episode number, credits all resolved
  Grand Finale couples in the week, and preserves settled sibling-night points
  during reveal/undo. No production recompute was run.
- Point previews explicitly describe module points before league weight/late
  factor; they do not claim to be the viewer's final weighted award.
- Historical prediction provenance remains unknown. New app/admin entries record
  actor, method and time; the admin backfill RPC requires a reason and actual
  pick time. No historical backfill was invoked.
- Internal editor links await pending edits and remain on failure; reload/close
  warns when dirty and cleanup flushes best-effort. Abrupt process termination
  cannot guarantee delivery. Browser Back is not specifically verified.
- Seven-day invite expiry is a retained safety improvement, with regeneration UI.
  Existing pending legacy codes are invalidated by the migration; accepted
  co-managers remain. Live PostgREST/Realtime column filtering needs staging QA.
- SMTP is absent. Confirmation/recovery delivery and email changes remain gated
  off; configuring a sender, templates and controlled-address tests is required.
- Backups, native iOS OAuth, physical touch behavior, live Realtime, cross-device
  persistence, staging migration and restore rehearsal remain unverified.

## Remaining owner/external work

Follow `audit-release-runbook.md`: obtain a private backup and rehearse restore;
apply the four SQL scripts outside live scoring; regenerate types, review the
result and coordinate deployment; approve global contributors; perform staging
smoke checks. Verify SMTP before activating any email-dependent flow. Confirm
historical backfill intent separately. Existing audit reports remain evidence
of their reviewed revision, not a claim that every finding is resolved here.
