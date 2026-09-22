# Session Handoff

_Last updated 2026-09-22. Read this first, then `CLAUDE.md`._

## 1. Current State

Two scoring changes were designed, implemented, and fully verified (including live) this session. **Neither is
git-committed yet** — both are sitting in the working tree, ready to commit, awaiting the user's go-ahead.

- **A. Grand Finale placement bonus removed.** It duplicated Dance Card's own placement bonus for the same
  roster-luck event (a rostered couple finishing top-5), just weighted under a different setting. Dance Card's own
  placement bonus is untouched. Grand Finale's full-order-prediction methods were rebalanced (offline Monte Carlo
  re-run) to absorb the freed budget.
- **B. Scoring settings now lock at the Season Clock anchor.** All commissioner-editable `scoring_settings` fields
  (weights, point values, category on/off toggles, `judges_score_starts_week` itself) freeze together the moment
  `effective_grand_finale_deadline()` passes — reusing the *existing* anchor mechanism, not a new one. Closes a gap
  where mid-season edits silently produced inconsistent standings (no snapshot of what settings scored a given
  week existed before this).

Both changes' live DB migrations were run by the user and verified against the real Supabase project (see §2).
Full rationale + file:line-level implementation detail for both live at
`/home/node/.claude/plans/thoughts-on-removing-the-lovely-starlight.md` (two superseding plans in one file —
read it before touching this code further).

## 2. Changes Made

Source of truth: `git diff --stat` against the working tree. **This session only touched the files below** — the
diff also currently shows `src/app/settings/page.tsx`, `src/components/account-settings-sheet.tsx`,
`src/components/site-admin-nav.tsx`, `src/lib/account-settings-data.ts`, `src/components/results-entry-nav.tsx`
(untracked), and `ios/App/App.xcodeproj/project.pbxproj` as modified/untracked — **none of those are this
session's work**. Per `CLAUDE.md`'s concurrent-work warning, that's other in-flight WIP (parallel session or
earlier leftover) sitting in the same tree; do not stage or commit it as part of this feature without checking
with the user first.

**This session's files:**
- `supabase/schema.sql` — both changes' schema edits (column drops/adds, `update_scoring_categories` rewritten
  twice, comment blocks updated).
- `supabase/apply-remove-grand-finale-placement-bonus.sql` (new) — change A's live migration, already run.
- `supabase/apply-lock-scoring-settings.sql` (new) — change B's live migration, already run.
- `src/lib/scoring.ts` — change A: removed `GRAND_FINALE_PLACEMENT_KEY` and its accumulator logic.
- `src/lib/results.ts` — change A: removed the five now-gone fields from the `computeWeeklyScores` call.
- `src/lib/season-clock-sync.ts` — change A: removed the same five fields from its own `update_scoring_categories`
  call (a second call site missed on the first pass, caught later).
- `src/app/leagues/[id]/settings/actions.ts` — change A: same five-field removal from `ScoringCategoriesInput`.
- `src/app/leagues/[id]/settings/page.tsx` — change B: computes `scoringLocked` server-side and passes it down.
- `src/components/league-modules-form.tsx` — both changes: removed the Grand-Finale-half UI (change A); added
  `disabled={scoringLocked}` to exactly the locked fields — module toggles, anchor week, category weights, all
  point values, Grand Finale method settings — while leaving waiver/draft/Pick-'Em-lock inputs editable (change B).
- `src/lib/grand-finale-explainer.ts` — change A: rebalanced default point values; dropped the now-dead
  "Separate from the placement bonus below" sentence.
- `src/lib/season-clock.ts` — change B: `explainSeasonClock`'s three branches now mention the settings lock.
- `scripts/monte-carlo-calibration/run.mjs` — change A: removed the Grand-Finale-half placement tracking; Grand
  Finale's methods now solve against the full budget instead of sharing it with a placement bonus.
- `src/lib/scoring.test.ts`, `src/lib/season-clock.test.ts` — test assertions updated to match.
- `src/lib/supabase/types.ts` — regenerated twice (once per live migration).
- `CLAUDE.md` — the Scoring Calibration bullet updated for change A.
- `MEMORY_HANDOFF.md` — this file.

**Verified for both**: 308/308 tests pass, `tsc --noEmit` clean, `npm run build` succeeds (18/18 pages), lint clean
except 8 pre-existing unrelated `scratch/*.mts` errors. Live: change A's 5 real leagues bulk-updated to rebalanced
values (confirmed via query); change B's 5 real leagues confirmed `locking_exempt = true`, and a throwaway-account
RPC test confirmed the lock actually rejects a real change post-deadline while still accepting a no-op resave.

## 3. Key Decisions & Lessons Learned

- **Per-category locking would have created a hindsight-gaming window.** Change B went through three design
  iterations before landing on "reuse the existing Season Clock anchor for everything" — a per-category lock
  (each module locks at its own first-score moment) would let a commissioner see one already-locked module's real
  results before finalizing another still-open module's weight. Reusing one existing shared trigger closes that
  window entirely, at the cost of a small, explicitly-accepted residual (Curtain Call could have a week or two of
  results before a deliberately-deferred draft's later anchor — user's call that this is negligible).
- **An independent fresh-context review agent caught real things** on change A: the two placement-bonus "halves"
  have correlation of exactly 1.0 by construction (literal same value in two accumulators), not just "highly
  correlated"; and `season-clock-sync.ts` was a second `update_scoring_categories` call site missed in the first
  file inventory. One false positive (flagged nonexistent column-level grants) — verify subagent claims against
  source before acting, don't just trust them.
- **A missed call site was only caught by the full regenerate-and-typecheck cycle, not by grep** —
  `league-modules-form.tsx` had its own local `ScoringSettings` type duplicating `scoring.ts`'s, still declaring
  the removed fields. Only surfaced once `types.ts` was regenerated against the live post-migration schema.
  Grep-based inventory isn't sufficient verification on its own.
- **Dance Card's own placement bonus has a real, separate ~25% calibration overshoot** — confirmed genuine (not
  noise), deliberately left unfixed. A rigorous fix was computed and rejected: it would shrink the bonus from
  106/53/28/14/7 down to ~14/7/4/2/1, gutting the feature rather than fixing a bug. This is a product tradeoff to
  revisit deliberately, not a quiet patch — full numbers in the plan file if it comes up again.
- **Real weight customization changes what game a league is playing, not just emphasis.** One real league has
  Dance Card weighted 8x (83% of standings influence — the other two modules are close to decorative there);
  another has Grand Finale weighted highest (43%, inverting the usual default emphasis). Worth knowing before
  assuming default-weight intuitions hold for any specific league.
- **"March Madness" payout-curve reshaping was explicitly declined** — user confirmed they only meant the
  placement-bonus removal, not restructuring how the three Grand Finale methods pay out. Don't reopen unprompted.
- **Real production leagues existed already** (5, not just the earlier deleted QA league) — checked live data
  before assuming any existing-row migration question was moot. Don't assume; check.

## 4. Backlog & Deferred Items

- **Browser UI check** for both changes (Grand Finale Settings card + the new locked-state rendering) — not yet
  visually exercised, no browser automation tool available this session.
- **Dance Card's ~25% calibration overshoot** — confirmed real, deliberately deferred as a product decision, not
  an engineering bug. Needs a real conversation about whether the placement bonus should matter this much before
  any fix, since the rigorous fix neuters it.
- Full Monte Carlo recalibration against real Season 35 data — blocked on live SQL/`SUPABASE_ACCESS_TOKEN` access
  this container doesn't have, and the season isn't over yet regardless.
- Carried over, untouched: a human click-through of the custom-draft lobby UI, the dead "not a member" branch in
  `set_custom_draft_order`, the Settings "✓ Settings saved" banner not clearing on edit, Site Admin page visibility.

## 5. Next Steps

1. Confirm with the user whether to commit change A and change B (likely as two separate commits — they're
   logically distinct) and push.
2. If time allows: browser click-through of League Settings (Grand Finale card + locked-state UI) before calling
   either change fully done.
3. Otherwise, no queued task — ask what's next. Candidates in §4.
