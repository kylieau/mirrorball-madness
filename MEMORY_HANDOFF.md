# Session Handoff

## 1. Current State

"League at a Glance" on the Picks tab is built, user-reviewed ("looks perfect") and committed to main. It shows every *other* manager's picks at the bottom of the existing Curtain Call, Dance Card and Grand Finale cards. Grand Finale also got a scoring explainer, per-row points, a next-predicted-elimination highlight, and a corrected position/payout rule. Nothing is mid-flight. A week-2 republish in #supportSWEKylie already confirmed the Curtain Call total mismatch was a stale stored score.

## 2. Changes Made (commit 03523ee; `git diff --stat` source of truth)

Modified: `CLAUDE.md`, `src/app/leagues/[id]/page.tsx`, `src/components/grand-finale-box.tsx`, `past-picks-card.tsx`, `pick-em-box.tsx`, `roster-card.tsx`, `src/lib/format-week.ts` (+test), `grand-finale-pins.ts` (+test), `past-picks.ts` (+test), `results.ts`, `scoring.ts` (+test).

Created: `src/components/curtain-call-league-list.tsx`, `dance-card-league-list.tsx`, `grand-finale-league-list.tsx`, `grand-finale-order-list.tsx`, `src/lib/grand-finale-predictions.ts` (+test), `src/lib/use-persisted-state.ts`.

Deleted: none. Not mine and left uncommitted: `ios/App/App.xcodeproj/project.pbxproj`, `account-settings-sheet.tsx` and `results-screen.tsx` (another session's WIP), `scratch/`, and `claude/grand-finale-picks-feedback-brief.md` (stale brief, describes a dropped design).

## 3. Key Decisions & Lessons Learned

- League lists live inside the existing cards, follow each card's carousel week, and exclude the viewer. Managers order by that week's points then name. Carousels were not modified.
- Grand Finale "next elim" is the couple in the next elimination slot (same slot for every manager), computed against the viewer's spoiler-clamped couples. It falls back to the next couple still in if the slot's couple is already gone.
- Grand Finale positions: `eliminationPositionRanges` (`scoring.ts`) gives same-week eliminations a shared range, and a prediction inside it is exact. This replaced the engine's rank-of-week rule, which shifted every later couple after a double elimination. Engine and UI share the function. `grandFinaleBestCasePoints` drives the "up to N" ceiling. Old stored points only change when a week is republished.
- Curtain Call per-pick points are recomputed live; the week total is the stored value, so they disagree until republish after a scoring-setting change.
- Do not run `npm run build` or `rm -rf .next` while `next dev` is running; it broke the user's dev server ("Cannot find module ./vendor-chunks/@capacitor.js"). Use `npx tsc --noEmit`, lint and vitest instead.
- Several sessions share this working directory; stage files by name. Mockup wording (e.g. "Unlocked after lock") is not spec; do not rename existing titles from mockups unless asked.

## 4. Backlog & Deferred Items

- Weeks published before the scoring change need a republish to correct their Grand Finale points.
- 4th/5th place bonuses now use the corrected positions; a double elimination in the top five gives both couples the lower placement's bonus. Worth a look before the finale.
- Only pure functions have unit tests; the `results.ts` wiring of the new position ranges and the new components were checked only by the user in the browser, and no full `npm run build` was run after the first round of changes.
- Unrelated WIP files listed above are still uncommitted.

## 5. Next Steps

Ask the user whether to delete or keep `claude/grand-finale-picks-feedback-brief.md`, and run `npm run build` once the dev server is stopped. Then take whatever Picks or scoring feedback comes next.
