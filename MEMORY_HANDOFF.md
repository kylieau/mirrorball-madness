# Session Handoff

## 1. Current State
**Enter Results link fix** — the Account Settings sheet's Enter Results / Scores links now work when tapped while already on `/admin/results`. User confirmed by hand. **Uncommitted; committing it is the next step.**

Done and committed this session: doc consolidation (recovered the pre-cut CLAUDE.md/handoff from git history and folded the non-recoverable memory back in) and, earlier, League at a Glance on the Picks tab (03523ee).

## 2. Changes Made
Uncommitted (`git diff --stat`): `src/components/account-settings-sheet.tsx` (+14/−2, sheet is controlled; a click on any `<a>` inside `SheetContent` closes it) and `src/components/results-screen.tsx` (+13/−6, `?tab=` is the source of truth for the tab; `setTab` uses `window.history.replaceState`). Also dirty: `ios/App/App.xcodeproj/project.pbxproj` — parallel session, don't stage.

Committed (36806bb): `CLAUDE.md` (+ **Settled Decisions**), `BACKLOG.md` (+ Scoring calibration follow-ups / Draft order editing placement / Parked nits), `MEMORY_HANDOFF.md`. **2 commits unpushed.**

Untracked, not this work: `claude/` (stale brief for a dropped design), `scratch/` — including `scratch/recovered-docs/` (the recovered pre-cut docs; delete once reviewed).

## 3. Key Decisions
- **Doc roles.** `CLAUDE.md` = conventions + settled decisions; `BACKLOG.md` = the durable deferred list; `MEMORY_HANDOFF.md` = a lean snapshot of the current session. Deferred items go in BACKLOG.md, never only the handoff — the handoff is overwritten every session (61 commits) and ~10 real items were nearly lost that way.
- CLAUDE.md was cut 39.8 KB → 12.3 KB (60e64c4) for token bloat. Don't restore it wholesale: most was re-derivable from code and some was already stale. Only absence-facts (deliberate omissions) and naming rationale were worth keeping, and they're now in Settled Decisions.
- `replaceState` (Next syncs it into `useSearchParams`), not `router.replace`, so tab switches don't refetch server data.
- No browser in this container (Playwright unsupported on debian11-arm64) — UI verification is the user's.
- Never `npm run build` / `rm -rf .next` while `next dev` holds port 3000. Use `npx tsc --noEmit`, lint, `npm test`.
- Shared working dir across sessions: stage files by name, never `git add -A`.

## 4. Backlog
Product/tech items live in [BACKLOG.md](BACKLOG.md). Only here:
- Weeks published before the Grand Finale scoring change need a republish to correct their points.
- Double elimination in the top five gives both couples the lower placement's 4th/5th bonus — review before the finale.
- No full `npm run build` since League at a Glance; `results.ts` position-range wiring and the new components were verified only in-browser.
- Unresolved: user said "these are separate pages now" about Scores/Enter Results, but the repo still uses one page with `?tab=`.

## 5. Next Steps
`git add src/components/account-settings-sheet.tsx src/components/results-screen.tsx`, commit the Enter Results fix, push all 3 commits. Then `npm run build` once no dev server holds port 3000.
