# Session Handoff

_Last updated 2026-09-23. Read this first, then `CLAUDE.md`. This handoff is
written for a **tool switch** (previous session was Claude Code, ran out of
usage) — nothing here depends on Claude-Code-specific state, all referenced
docs are committed files in this repo._

## 1. Current State

`main` is clean and fully pushed — `git status` shows only the pre-existing,
unrelated `ios/App/App.xcodeproj/project.pbxproj` diff and the untracked
`scratch/` directory (both long-standing, not from this session, safe to
ignore or leave alone). Nothing uncommitted, nothing to recover.

**Shipped and merged this session**: PR #30 (`results-access-tiers` branch,
10 commits, fast-forward-merged — no merge commit) shipped two things:

- **Results access split into view/propose/publish tiers**, replacing the
  old `RESULTS_ENTRY_OPEN_TO_ALL` env toggle (now fully removed). See
  CLAUDE.md's "Results entry has three access tiers" bullet for the current,
  accurate description — don't trust anything about `RESULTS_ENTRY_OPEN_TO_ALL`
  if it shows up anywhere else, that's stale.
- **A full chrome/navigation redesign** of the admin results surfaces,
  iterated through several rounds of live-preview feedback: `/admin/results`
  (titled "Scores") has no bottom nav and a By Week/By Couple switcher in the
  page header; Schedule split into its own page (`/admin/schedule`); Show
  Settings (judges/dance styles/season dates) split into its own page
  (`/admin/show-settings`); Account Settings gained an "Episodes" section
  with Schedule as its own row and a click-to-expand "Scores" row revealing
  By Week/By Couple in the sheet itself. See CLAUDE.md's "League settings are
  reached from Account settings" bullet for the current shape.
- One small follow-up after merge: the "Commissioner"/"Manager · view only"
  role hint under each League Settings row was removed — those rows now show
  just the league name.
- Two throwaway QA accounts used during this work
  (`tier-commish@mirrorball-test.local`, `tier-plain@mirrorball-test.local`)
  were created, used, and **already deleted** — don't assume they exist.

**Not started**: Phase 2, a taxonomy addition (round types like Team Dance/
Trio Dance as a managed list, dance style categories, moving "Dances Per
Couple" to the Schedule page). **Fully planned** — see
`PHASE2_TAXONOMY_PLAN.md` in this repo root for the complete, file-by-file
implementation plan, re-verified against the current post-merge codebase
(exact line numbers, existing patterns to reuse, a couple of real gaps found
while re-grounding). That file is self-contained; start there.

## 2. Key Decisions & Lessons Learned (this session)

- **UX for admin-adjacent pages iterates fast and visually** — the project
  owner reviews live Vercel previews on her phone rather than describing what
  she wants in detail up front. Expect several small rounds ("remove this
  description," "make this click-to-expand instead," "no I meant show it in
  the settings sheet, not a new page") rather than one big spec. Don't
  over-build ahead of explicit direction; small, quickly-deployed increments
  worked well here.
- **A "Push Pilot" (her name for a Grok-based bot) reviews Vercel previews
  on her phone before she approves a merge** — this is her own process, not
  something to chase, verify, or wait on from the assistant side. She says
  explicitly when it's fine to merge.
- **This devcontainer environment has no `gh` CLI.** PR creation, status
  polling, and reading the Vercel preview URL (which is *not* the
  `target_url` on the commit status — that's the Vercel dashboard link; the
  real preview URL is in the `vercel[bot]` PR comment body, or the
  `deployments` API) all went through the GitHub REST API directly via
  `curl`, authenticated with the token from `git credential fill` (works in
  VS Code-based devcontainers for both git push and API calls).
- **A fast-forward merge (`git merge --ff-only`, plain push) is cleaner than
  the GitHub merge API when the base branch hasn't moved** — preserves every
  commit individually with no merge commit, matches this repo's established
  history style, and GitHub still auto-detects and marks the PR merged from
  the direct push.
- **This repo has a standing concurrency hazard**: multiple sessions/tools
  can end up pointed at the same working directory. Mid-session here, another
  session's uncommitted WIP (`scoring.ts`/`schema.sql`, a Curtain Call
  near-miss feature) showed up in `git status` unrelated to anything being
  worked on. It was left completely untouched (never staged, never edited,
  never stashed) and later resolved on its own. **Always check `git status`
  before staging/committing, and stage explicit filenames — never
  `git add -A`** — so unrelated in-flight work never gets swept in.
- **`npm run build` while a `next dev` server is running breaks the dev
  server** (overwrites its `.next` directory out from under it) — check
  `ps aux | grep "next dev"` before running a production build if one might
  be up.
- Full architectural rationale for round types vs. dance styles vs. episode-
  level metadata lives in `PHASE2_TAXONOMY_PLAN.md`'s Context section — worth
  reading before questioning any of those calls, they were deliberated.

## 3. Backlog & Deferred Items

- **Phase 2 (taxonomy)** — see `PHASE2_TAXONOMY_PLAN.md`. Not started.
- **Dance Card's ~25% calibration overshoot** — confirmed real in an earlier
  session, deliberately deferred as a product decision (the rigorous fix
  would gut the feature: 106/53/28/14/7 → ~14/7/4/2/1). Needs a real
  conversation about whether the placement bonus should matter this much
  before any fix.
- Full Monte Carlo recalibration against real Season 35 data — blocked on
  live SQL/`SUPABASE_ACCESS_TOKEN` access most containers for this project
  don't have, and the season isn't over yet regardless.
- Carried over, untouched from earlier sessions: a human click-through of
  the custom-draft lobby UI, the dead "not a member" branch in
  `set_custom_draft_order`, the Settings "✓ Settings saved" banner not
  clearing on edit.
- `addTeamDance`/`TeamDanceSheetContent` ("Score a Team Dance" button in
  Enter Results) is now slightly under-named once Trio Dance exists as a
  round type too — it's a generic "same dance, multiple couples" bulk-entry
  mechanic, not team-dance-specific. Noted as a reasonable future cosmetic
  rename, not urgent.

## 4. Next Steps

1. Read `PHASE2_TAXONOMY_PLAN.md` in full before writing any code — it has
   exact file:line references and reasoning for every call made.
2. Confirm with the project owner whether Phase 2 should also start as a
   draft PR awaiting Push Pilot review, matching PR #30's pattern.
3. Implement per the plan; re-verify line numbers with a fresh grep before
   editing, since this doc and the plan file may drift from the exact
   current code by the time this is picked up.
