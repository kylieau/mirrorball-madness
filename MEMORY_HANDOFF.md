# Session Handoff — 2026-10-22 (first-user QA pass shipped)

## 1. Current State

**The first-user QA pass is fixed, verified and deployed.** Kylie approved the push to `main` (production deploy). Commits:
- `57854a0`: `scripts/qa-screenshots/seed.mjs` is crash-safe.
  - `up` refuses to overwrite a live run and writes state after each account.
  - `down` and the new `sweep` delete every `@mirrorball-test.local` account, plus any league only QA accounts belong to.
  - The state file is kept until a sweep is clean.
  - Not tested: the "league with a real member" guard (it would need a real person).
- `7ec059a`:
  - sign-up trims the display name and refuses a blank one;
  - invite codes are trimmed, and the Join box's 6-character limit was removed (it cut pasted " F2RHPE " down to "  F2RH");
  - every join redirects to Picks with `?message=Welcome to {league}!`.
- `5bab43d`:
  - Grand Finale prices pre-placed couples on `effective_hard_deadline_week`, so a pre-draft league shows "—" instead of a false "+8.33 pts";
  - with one league, the league name sits under the Picks/Standings title;
  - the guest banner says "See where everyone landed";
  - "Set Up Draft" / "View Draft Order & Set Auto-Picks" are Title Case;
  - a global `accent-color` makes native checkboxes gold;
  - `Button` with `nativeButton={false}` restates `role="link"` (documented in CLAUDE.md);
  - the invite pages have "‹ Back to Home".
- `dc7c31f`: CLAUDE.md says all three modules start on for a new league (Kylie confirmed that's intended).

**Verified:**
- Browser at 375px on the dev server, plus a production build with throttling.
- Build passes; 645 tests pass.
- Lint is clean on `src`. The only lint errors are in gitignored `.codex-private/`.
- Production after the sweeps: 27 auth users = 27 profiles, no QA leagues.

**Earlier today:**
- the E08 checklist is in `docs/audit-release-runbook.md`;
- 31 stray test accounts were deleted (Kylie ran the SQL);
- balla is an approved Results Contributor.

## 2. Changes Made

All of the commits above, plus this handoff, are on `main` and pushed.

**Not ours; leave unstaged:**
- `.devcontainer/devcontainer.json`: Kylie's machine-only Codex SSH setup. Don't commit it as is.
- `.devcontainer/Dockerfile.codex`, `.devcontainer/devcontainer-lock.json`, `.agents/`, `AGENTS.md`
- `ios/App/App.xcodeproj/project.pbxproj`
- `supabase/queries/*.sql`

## 3. Key Decisions
- **Deploy freeze from Sun Oct 25 until E08 is published** (agreed with Kylie). Before then, only small, verified fixes for real blockers.
- **QA against production:** use `seed.mjs` QA-domain accounts only, sign up through the form with `@mirrorball-test.local`, and always finish with `seed.mjs sweep`. Sign-up has `mailer_autoconfirm` on, so no emails go out.
  - Run the browser helpers with `node --input-type=module -` from the project root, so `playwright-core` resolves.
  - Measure slow-network timing on a production build only. The dev bundles time out.
- **Settled this session:**
  - All three modules default on.
  - "Need Home & High picks" stays (established card vocabulary).
  - A Dance-Card-off mid-season league keeps Anchor Week 1, so its pre-placed Grand Finale couples pay. That's equal for every manager, so leave it.
- **Production deletions:** the auto-mode classifier blocks ad-hoc auth-user deletes even after Kylie's yes. The checked-in `seed.mjs sweep` is allowed. For anything else, hand Kylie a guarded `.sql` (exact-count `raise exception`).
- **Never `pkill -f`** (it killed this session's shell). Stop a server by the pid from `ss -ltnp`, or by its background task.
- **Deploy approval:** a push to `main` deploys production and needs Kylie's explicit yes in that turn. That includes a handoff sync carrying unpushed code.
- **Unchanged:**
  - The late Grand Finale air-to-publish pause stays.
  - Rehearse SQL with a rolled-back transaction.
  - Check the old-app gap before revokes.
  - Instructions say where to run things.
  - Never ask for the DB password.
  - Live safety: throwaway accounts only; never fake releases or `dance_scores`.
  - Run tests as `npx vitest run src`.
  - Stage by name.
  - Attribution: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Minor:** the `SUPABASE_ACCESS_TOKEN` in `.env.local` returns 401 (expired), so type regeneration needs a fresh token. `.env.local` also carries a stale `RESULTS_ENTRY_OPEN_TO_ALL` that no code reads.

## 4. Backlog & Next Steps
See BACKLOG "First-user QA pass — 2026-10-22" (only kept and known items remain) and "Audit remediation — 2026-10-20".

**Kylie, before 8 PM ET Tue Oct 27:**
- get Jonathan Au and arielle's open Grand Finale late entries submitted or closed;
- approve any other Results Contributors.

**E08:** follow the runbook checklist. After Finish Week, Claude runs the service-role verification (step 8).

Next command: none pending. Next work is E08 night.
