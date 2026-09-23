# Session Handoff

## 1. Current State
Two things landed; the code fix is uncommitted:
- **Enter Results link fix** — the Account Settings sheet's Enter Results / Scores links now work when tapped while already on `/admin/results`. User confirmed by hand. **Uncommitted.**
- **Doc consolidation** — recovered the pre-cut CLAUDE.md / MEMORY_HANDOFF.md, audited what the token-saving cuts lost, and folded the non-recoverable parts into CLAUDE.md and BACKLOG.md. Committed.
- Earlier, already on main: **League at a Glance** on the Picks tab (03523ee).

## 2. Changes Made
Uncommitted (`git diff --stat`):
- `src/components/account-settings-sheet.tsx` — sheet is controlled; a click on any `<a>` inside `SheetContent` closes it.
- `src/components/results-screen.tsx` — `?tab=` in the URL is the source of truth for the tab; `setTab` uses `window.history.replaceState`.
- `ios/App/App.xcodeproj/project.pbxproj` — not this work (Capacitor/parallel session); don't stage.

Committed this session: `MEMORY_HANDOFF.md`, `CLAUDE.md` (new **Settled Decisions** section), `BACKLOG.md` (new Scoring calibration follow-ups / Draft order editing placement / Parked nits sections).

Untracked, not this work: `scratch/`, `claude/grand-finale-picks-feedback-brief.md` (stale brief, dropped design). `scratch/recovered-docs/` holds the recovered pre-cut docs — delete once reviewed.

## 3. Key Decisions
- **Doc roles, to stop losing memory again:** `CLAUDE.md` = conventions + settled decisions; `BACKLOG.md` = the durable deferred list; `MEMORY_HANDOFF.md` = a lean snapshot of *this* session only. Anything deferred must go into BACKLOG.md, not just the handoff — the handoff gets overwritten every session (61 commits so far), and ~10 real backlog items were nearly lost that way.
- CLAUDE.md was cut 39781 → 12320 bytes on 09-23 (60e64c4) for token bloat. Most of the cut was re-derivable UI detail, and some was already stale (it still called the Curtain Call card "Your Weekly Pick 'Em"). Don't restore it wholesale — only absence-facts and naming rationale were worth keeping.
- `replaceState` (Next syncs it into `useSearchParams`), not `router.replace`, so tab switches don't refetch server data.
- No browser in this container (Playwright unsupported on debian11-arm64); UI verification is by the user.
- Never run `npm run build` / `rm -rf .next` while `next dev` holds port 3000. Use `npx tsc --noEmit`, lint, `npm test`.
- Shared working dir across sessions: stage files by name, never `git add -A`.

## 4. Backlog
Product/tech items now live in [BACKLOG.md](BACKLOG.md). Open here only:
- Weeks published before the Grand Finale scoring change need a republish to correct their points.
- Double elimination in the top five gives both couples the lower placement's 4th/5th bonus — review before the finale.
- No full `npm run build` since the League at a Glance work; `results.ts` position-range wiring and the new components were verified only in-browser.
- User said "these are separate pages now" about Scores/Enter Results; the repo still uses one page with `?tab=`. Unresolved — ask if it matters.
- Decide whether to delete `claude/grand-finale-picks-feedback-brief.md`.

## 5. Next Steps
`git add src/components/account-settings-sheet.tsx src/components/results-screen.tsx` and commit the Enter Results fix, then push (2 doc commits are also unpushed). Run `npm run build` once no dev server is running.
