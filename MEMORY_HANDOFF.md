# Session Handoff

## 1. Current State
Nothing in flight. Everything from this session is **committed and pushed** (`8c621f5`, on `origin/main`); type-check, lint and all 353 tests pass. **Not** run: a full `npm run build` (dev server holds port 3000) and any in-browser check — the user tested in their own dev preview and signed off on each piece. This session shipped:
- **2-decimal fantasy points platform-wide**: `src/lib/format-points.ts` (`roundPoints` / `formatPoints` / `formatSignedPoints`); scoring math rounds to 2 dp; judge scores stay integers; Grand Finale explainer float noise and In Jeopardy whole-point flooring fixed.
- **Picks**: roster header is the viewer's Dance Card total ("N pts this season") plus a per-week Survival & Bonuses row (viewer and expanded peers, `weeklyBonusPoints`); "N couples left" removed from Curtain Call lines (payout-scaling note now in League Settings); League at a Glance collapsed behind one shared `LeagueGlanceHop` on Dance Card / Curtain Call / Grand Finale; Grand Finale "How Points Work" toggle shown only while building a bracket (removed from the saved/locked summary).
- **Standings**: "Not on a roster" box removed from Dance Cards (draft room still shows "Not Drafted").
- **Scores**: By Week and By Couple hide nights a couple wasn't scheduled for (`episode_participants`); withdrawals/eliminations still show.

## 2. Changes Made
Ours (all in `8c621f5`): `src/lib/{format-points,scoring,roster-weekly-points,roster-couple-points,episode-participants,grand-finale-explainer}.ts` (+ tests), `src/components/{league-glance-hop,dance-card-league-list,curtain-call-league-list,grand-finale-league-list,grand-finale-order-list,grand-finale-box,roster-card,league-rosters-card,league-modules-form,standings-table,standings-module-breakdown,home-dashboard,weekly-results-view,all-results-view,results-screen,past-picks-card,pick-em-box}.tsx`, `src/app/leagues/[id]/page.tsx`, `CLAUDE.md`.
**Not ours, leave unstaged:** `ios/App/App.xcodeproj/project.pbxproj` (Capacitor/parallel session); untracked `claude/` and `scratch/`.

## 3. Key Decisions
- **Only fantasy points get 2 dp** (`12.00`); raw judge scores stay plain integers. The rounding rule is 2 dp (not "stop rounding"). Never interpolate a points value into copy unformatted.
- **Hiding non-dancing nights uses `episode_participants`** (the schedule mechanism), not a "no dance scores" heuristic; real events (withdrawn, eliminated, judges' save, immunity, bonus) always show.
- **League at a Glance = collapsed hop, expands inline in one bordered container**; no sheet/scrim/swap. The full inline-open redesign from the design pack was tried and reverted (user disliked the peer-row redesign); only the hop interaction shipped, peer rows unchanged.
- **Curtain Call payout-scaling explanation lives in League Settings only**, not on the Picks lines.
- Doc roles: `CLAUDE.md` = conventions + settled decisions; `BACKLOG.md` = deferred list; this file = current-session snapshot only. Deferred items go in BACKLOG.md.
- Never `npm run build` / `rm -rf .next` while `next dev` holds port 3000 (currently running); verify with `npx tsc --noEmit`, lint, `npm test`. No browser in this container — UI verification is the user's.
- Shared working dir across sessions: `git fetch` + `git status -sb` before writing; stage files by name, never `git add -A`.

## 4. Backlog & Next Steps
All deferred work is in [BACKLOG.md](BACKLOG.md): Standings points breakdown (being designed in a separate session), scoring display follow-ups, Grand Finale / Dance Card review items, housekeeping (full build owed, stale `claude/` and `scratch/recovered-docs/`).

Next: start the next session with `/resume-handoff`. Then, with no dev server on port 3000: `npm run build`.
