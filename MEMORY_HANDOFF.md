# Session Handoff

## 1. Current State
Nothing in flight. Everything from this session is **committed, pushed, and in sync with origin/main** (HEAD `d209351`):
- **Enter Results link fix** (`61672ef`) — Account Settings sheet links work when tapped while already on `/admin/results`. User confirmed by hand.
- **Doc consolidation** (`36806bb`) — recovered pre-cut CLAUDE.md/handoff from git history; folded non-recoverable memory into CLAUDE.md (**Settled Decisions**) and BACKLOG.md.
- **Slash commands** (`639ef7a`, `d209351`) — `/sync-handoff` (end of session) and `/resume-handoff` (start), in `.claude/commands/`. `/resume-handoff` is untested in a cold session.
- Earlier, on main: League at a Glance on the Picks tab (`03523ee`).

## 2. Changes Made
`git diff --stat` shows only `ios/App/App.xcodeproj/project.pbxproj` — **not ours** (parallel session / Capacitor wrapper); leave unstaged. Untracked, not code work: `claude/` (stale brief for a dropped design) and `scratch/` (includes `scratch/recovered-docs/`, the recovered pre-cut docs — delete once reviewed).

## 3. Key Decisions
- **Doc roles.** `CLAUDE.md` = conventions + settled decisions; `BACKLOG.md` = durable deferred list; `MEMORY_HANDOFF.md` = snapshot of the current session only. Deferred items go in BACKLOG.md, never only here — this file is overwritten every session and ~10 real items were nearly lost that way.
- CLAUDE.md was cut 39.8 KB → 12.3 KB (60e64c4) for token bloat. Don't restore wholesale: most was re-derivable from code and some was stale. Only absence-facts and naming rationale were kept.
- Tab state lives in the URL; `setTab` uses `history.replaceState` (Next syncs it into `useSearchParams`), not `router.replace`, to avoid refetching page data.
- No browser in this container (Playwright unsupported on debian11-arm64) — UI verification is the user's.
- Never `npm run build` / `rm -rf .next` while `next dev` holds port 3000. Use `npx tsc --noEmit`, lint, `npm test`.
- Shared working dir across sessions: stage files by name, never `git add -A`.

## 4. Backlog
Product/tech items live in [BACKLOG.md](BACKLOG.md). Only here:
- Weeks published before the Grand Finale scoring change need a republish to correct their points.
- Double elimination in the top five gives both couples the lower placement's 4th/5th bonus — review before the finale.
- No full `npm run build` since League at a Glance; `results.ts` position-range wiring and new components were verified only in-browser.
- Unresolved: user said "these are separate pages now" about Scores/Enter Results, but the repo still uses one page with `?tab=`.
- Decide whether to delete `claude/grand-finale-picks-feedback-brief.md` and `scratch/recovered-docs/`.

## 5. Next Steps
Start the next session with `/resume-handoff`. Then, with no dev server on port 3000: `npm run build`.
