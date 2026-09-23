# Session Handoff

## 1. Current State
Two things landed; only the second is uncommitted:
- **League at a Glance** (Picks tab: other managers' picks under the Curtain Call, Dance Card and Grand Finale cards, plus Grand Finale explainer/per-row points/next-elim highlight) — done, user-approved, committed (03523ee).
- **Enter Results link fix** — Account Settings sheet's Enter Results / Scores links now work when tapped while already on `/admin/results`. User confirmed by hand. **Uncommitted.**

## 2. Changes Made (`git diff --stat`)
- `src/components/account-settings-sheet.tsx` — sheet is controlled; a click on any `<a>` inside `SheetContent` closes it.
- `src/components/results-screen.tsx` — `?tab=` in the URL is the source of truth for the tab; `setTab` uses `window.history.replaceState`.
- `ios/App/App.xcodeproj/project.pbxproj` — not this work (Capacitor/parallel session); don't stage.
- Untracked, not this work: `scratch/`, `claude/grand-finale-picks-feedback-brief.md` (stale brief for a dropped design).

## 3. Key Decisions
- `replaceState` (synced into `useSearchParams` by Next), not `router.replace`, so tab switches don't refetch server data.
- No browser in this container (Playwright unsupported on debian11-arm64); UI verification is by the user.
- Never run `npm run build` / `rm -rf .next` while `next dev` is on port 3000 (breaks it). Use `npx tsc --noEmit`, lint, `npm test`.
- Grand Finale positions use `eliminationPositionRanges` (`scoring.ts`): same-week eliminations share a range; a prediction inside it is exact. Curtain Call per-pick points are live, week total is stored, so they differ until republish.
- Shared working dir across sessions: stage files by name, never `git add -A`.

## 4. Backlog
- Weeks published before the scoring change need a republish to fix Grand Finale points.
- Double elimination in the top five gives both couples the lower placement's 4th/5th bonus — review before the finale.
- Only pure functions are unit-tested; `results.ts` position-range wiring and new components were checked only in-browser; no full `npm run build` since.
- User said "these are separate pages now" about Scores/Enter Results; unclear — repo still uses one page with `?tab=`. Ask if it matters.
- Decide whether to delete `claude/grand-finale-picks-feedback-brief.md`.

## 5. Next Steps
`git add src/components/account-settings-sheet.tsx src/components/results-screen.tsx` and commit the Enter Results fix (once user OKs), then run `npm run build` when no dev server is running.
