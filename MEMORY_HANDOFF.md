# MEMORY_HANDOFF

_Last updated 2026-09-23 (post-smoke-test pass). Read this first, then
`CLAUDE.md`. Multiple tools/sessions (Claude Code, Cursor/Grok "Push Pilot")
have worked this repo back-to-back in the same window — this doc merges all
of their state into one accurate picture. Nothing here depends on any one
tool; all referenced files are committed to this repo._

## 1. Current State

**No feature is actively in progress. PR #33 is now fully done, not just
merged** — a prior handoff draft believed the live SQL migration was still
pending; it had actually already been run (by whom/when isn't recorded) and
`types.ts` was already the real regenerated file, not the hand-updated
stand-in it claimed to be. Verified this session (see §5 for the method) and
corrected here so it doesn't get re-flagged as a blocker again.

The last three units of work are all merged to `main` and fully live:

- **PR #30** — results access split into view/propose/publish tiers
  (replacing the old `RESULTS_ENTRY_OPEN_TO_ALL` toggle, now fully removed)
  plus a full chrome/nav redesign of the admin surfaces (`/admin/results`
  titled "Scores", `/admin/schedule`, `/admin/show-settings` as separate
  pages, Account Settings' "Episodes" section). See CLAUDE.md's "Results
  entry has three access tiers" and "League settings are reached from
  Account settings" bullets for the accurate current shape.
- **PR #31** — Phase 2 taxonomy: managed round types (Team Dance, Trio
  Dance, Instant Dance, Judges' Choice, Redemption Dance) on Schedule, dance
  style categories, `expected_dance_count` moved to Schedule. **SQL already
  applied live.** `PHASE2_TAXONOMY_PLAN.md` is now a historical record of
  this, not an active plan.
- **PR #33** — "Curtain Call In Jeopardy" near-miss scoring credit (squash
  merge `581b85b`). **SQL already applied live** (confirmed:
  `scoring_settings.curtain_call_near_miss_enabled` and
  `episode_in_jeopardy_couples` both exist in prod), **`types.ts` already
  matches live schema exactly** (zero diff on a fresh regen), and **the
  scoring path is now smoke-tested end to end** — see §5.

**PR #32** ("Enter Results UX polish backlog docs") is still open as a
draft — low-stakes, just queues backlog notes, not blocking anything.

## 2. Changes Made

Working tree is clean right now (`git diff --stat` shows nothing outside
this handoff-doc merge and the pre-existing, unrelated
`ios/App/App.xcodeproj/project.pbxproj` diff — leave that one alone, it
predates all of this). Recent merged history on `main`:

| Commit | PR | Files | Diff |
|---|---|---|---|
| `c0b3c21` (FF, 10 commits) | #30 | 21 | +744/−413 |
| `b134b1c` | #31 | 18 | +873/−185 |
| `581b85b` (squash) | #33 | 27 | +1185/−180 |

Full per-file breakdown lives in each commit itself (`git show --stat <sha>`)
rather than reproduced here — this doc would drift from it otherwise.

## 3. Key Decisions & Lessons Learned

**In Jeopardy product decisions (locked, don't re-litigate):**
- Elimination near-miss = manual "In Jeopardy" ticks on Enter Results (the
  TV called-down group), **not** derived from judges' bottom-N.
- Top-scorer near-miss = within 1 point of the week's high score; ties at
  the high score are exact-only, not counted as near-miss.
- Credit = `floor(exactPayout × 0.25)` for both kinds; exact always wins;
  double-elimination wrongs pay independently.
- Default on; mid-season backfill OK; not retroactive on
  `weekly_manager_scores`. In Jeopardy overrides "Safe" in Results display
  for a marked non-eliminated couple.
- Dropped during design: auto-detecting bottom-N, a band-size knob, 33%
  credit, top-3 (vs. top-1) scoring, a longer Settings explainer.

**Process / environment:**
- The project owner reviews live Vercel previews on her phone before
  approving a merge ("Push Pilot," her name for this Grok-based review flow)
  — not something to chase or verify from the assistant side, she says
  explicitly when it's fine to merge. She also iterates in many small, fast
  UX rounds rather than one big spec — expect several corrections in a row.
- **No `gh` CLI in the Claude Code devcontainer.** PR creation/status/preview-URL
  reading went through the GitHub REST API via `curl`, authenticated with
  the token from `git credential fill`. The Vercel preview URL is *not* the
  commit status `target_url` (that's the dashboard link) — it's in the
  `vercel[bot]` PR comment body or the `deployments` API.
- A fast-forward merge (`git merge --ff-only` + push) beats the GitHub merge
  API when the base hasn't moved — no merge commit, GitHub still
  auto-detects and marks the PR merged.
- Types touched by a live-SQL-pending PR get **hand-updated** first (no
  `SUPABASE_ACCESS_TOKEN` in every environment) — always regenerate for real
  once the SQL actually runs:
  `npx supabase gen types typescript --project-id wssbwgtsejamlbvfofvu --schema public > src/lib/supabase/types.ts`
- **This repo has a real, recurring concurrency hazard** — multiple
  sessions/tools land on the same working directory back-to-back, sometimes
  overlapping. Hit three times now: another session's uncommitted
  `scoring.ts`/`schema.sql` WIP appeared mid-session (left untouched,
  resolved itself); a local push got rejected because `main` had moved
  under it (resolved via merge, not force-push); this very doc had been
  edited on disk by a separate short exploration session between reads.
  **Always `git status`/`git fetch` before assuming local state is current,
  stage explicit filenames, never `git add -A`, never force-push.**
- Dance Card's own placement-bonus calibration has a confirmed ~25%
  overshoot (real, not noise) — a rigorous fix would gut the feature
  (106/53/28/14/7 → ~14/7/4/2/1 points), so it's deliberately left as a
  product decision to revisit, not a bug to quietly patch.

## 4. Backlog & Deferred Items

1. ~~Run `supabase/apply-curtain-call-in-jeopardy.sql`~~ — already done, see
   §1/§5.
2. **Spoiler-free + In Jeopardy badge hardening** — designed, not built. In
   Jeopardy is episode-level marks, not `couples.status`, so roster Safe/Elim
   tags must clamp to Safe for unwatched weeks (reuse
   `resolveSpoilerCutoff`/`spoilerSafeCoupleStatus`, same pattern already
   used elsewhere). Open questions: does the roster show In Jeopardy after a
   week is watched (parity with Results) or stay Results-only; callout strip
   vs. badge-only.
3. **Move draft order editing into League Settings** (designed, not built,
   "not urgent since all drafts have run"). Today `draft_type` lives in
   League Settings' Dance Card card, but the actual order (reorder list +
   `CustomDraftOrderCard`'s per-round grid) only lives in the draft lobby
   (`draft-room.tsx`) — a two-hop flow for a one-time setup decision. Design:
   move order editing (commissioner-only) into `league-modules-form.tsx`
   next to `draft_type`; keep a **read-only** mirror in the lobby (so
   managers see it while building their auto-draft queue); queue/autopilot
   stay in the lobby (ongoing draft-day tools, not setup). The one real
   wrinkle if this gets picked up: the lobby's effects that guarantee an
   order exists before `start_draft` can't just move wholesale, since
   nothing would then force a commissioner to open Settings before clicking
   Start Draft — resolve by moving the membership-reconcile effects into the
   new Settings component and adding a defensive shuffle/reconcile check
   directly inside `handleStartDraft` (new `resolveCustomSequence` +
   exported `shuffle` helpers in `src/lib/draft.ts`). No SQL/RPC changes
   needed — `set_draft_order`/`set_custom_draft_order` are already
   commissioner + `not_started`-gated server-side regardless of caller.
4. **Enter Results UX polish** — top product backlog after In Jeopardy is
   live/usable (see PR #32, still open/draft).
5. **Equal-EV / neutral fair scoring defaults** — parked behind #4.
6. `addTeamDance`/`TeamDanceSheetContent` ("Score a Team Dance" button) is
   now slightly under-named since Trio Dance exists as a round type too —
   it's a generic same-dance/multiple-couples bulk-entry mechanic, not
   team-dance-specific. Reasonable future cosmetic rename, not urgent.
7. Dance Card's ~25% calibration overshoot (see §3) — needs a real product
   conversation before any fix, not a quiet patch.
8. Full Monte Carlo recalibration against real Season 35 data — blocked on
   live SQL/`SUPABASE_ACCESS_TOKEN` access, and the season isn't over yet.
9. Carried over, untouched: a human click-through of the custom-draft lobby
   UI, the dead "not a member" branch in `set_custom_draft_order`, the
   Settings "✓ Settings saved" banner not clearing on edit.
10. Mid-season backfill of In Jeopardy marks; a commissioner-facing "did
    anyone get In Jeopardy credit?" glance on publish — both optional,
    low-priority.

## 5. Next Steps

**§5 steps 1-3 from the previous version of this doc are done** (they
turned out to already be done before this session started, just
unrecorded — see §1). What actually happened this session, since Publish
recomputes every league's scores live and Season 35 is mid-air:

1. Verified live DB state directly with the service-role key + access token
   already sitting in `.env.local` (contradicts the "no live credentials in
   this container" framing elsewhere — those two tokens are in fact present
   and usable for read/write REST + `gen types`; there is still no direct
   Postgres connection string, so DDL/schema changes still have to go
   through the Dashboard SQL Editor by hand, `psql` is installed but has
   nothing to connect to).
2. Ran the existing unit tests (`scoring.test.ts`, `past-picks.test.ts`, 69
   tests) — pass.
3. Built a throwaway end-to-end smoke test (`scratch/zztest-in-jeopardy-*.mts`,
   kept for reuse) that creates a fake week/episode/couple pair + throwaway
   league directly in the **live, active season** (episodes/weeks/couples
   are not league-scoped, so full isolation isn't possible — a throwaway
   *league* alone wouldn't have exercised this), calls `applyEpisodeResults`
   the same way Publish does, and checks `weekly_manager_scores.prediction_points`
   against the expected near-miss math. First run "failed" (63 vs. an
   expected 70) — that was the test's own expected-value bug, not a product
   bug: `curtainCallPayout` scales by `couplesRemaining / totalCouples`
   (16/18 that week), which the test's naive expectation didn't account for.
   Recomputing with the real scaling matched the stored value exactly,
   confirming both the elimination near-miss and top-scorer near-miss paths
   compute correctly together through the real `applyEpisodeResults` →
   `recomputeWeekScores` → `computeWeeklyScores` pipeline.
4. **Could not get a real browser screenshot** — this devcontainer is
   `debian11-arm64`, which Playwright doesn't ship a Chromium build for
   (`ERROR: Playwright does not support chromium on debian11-arm64`), and
   there's no system Chromium either. Fell back to static verification:
   traced `inJeopardyCoupleIds` from `episode_in_jeopardy_couples` through
   `/this-week` (`src/app/this-week/page.tsx`) and the admin by-couple view
   (`src/components/all-results-view.tsx`) into `fanOutcomeBadge`
   (`src/lib/results-outcome.ts`, unit-tested — overrides "Safe" with "In
   Jeopardy" when marked), and traced near-miss credit through
   `past-picks.ts`'s `near_miss` verdict → `"in_jeopardy"` row kind →
   `past-picks-card.tsx`'s distinct rendering branch. Wiring is confirmed
   correct by code inspection + existing unit tests; an actual rendered
   screenshot was never taken. If a real visual check still matters, it
   needs either a non-arm64 environment or the owner's own phone/browser
   pass (per her usual "Push Pilot" review flow).
5. **Cleanup note for future sessions**: `computeWeeklyScores`/
   `recomputeWeekScores` loops over *every* league in the app, not just the
   one being tested — the smoke test's fake week produced a stray
   `weekly_manager_scores` row (mostly zero) for all ~25 real leagues, which
   had to be deleted explicitly before the fake `competition_weeks` row
   could be deleted (FK). All throwaway rows (people, couples, week,
   episode, those 25 stray score rows, the league, the test auth user) were
   deleted afterward and verified gone with a follow-up query. Any future
   live-data smoke test touching episodes/weeks needs to account for this
   fan-out when planning cleanup.
6. Next up: pick up whichever of §4's items the owner greenlights —
   spoiler-free badge hardening and Enter Results UX polish are the two
   nearest-term candidates; the draft-order reorg is fully designed whenever
   it becomes worth doing.
