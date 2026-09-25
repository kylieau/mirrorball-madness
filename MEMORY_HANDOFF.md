# Session Handoff

## 1. Current State
**The Manage Leagues (`/leagues`) triage rebuild is committed and pushed** (`b4254a8` on `origin/main`); the user checked it on their phone and signed off (Home spacing, cards, buttons, Spoiler-Free "Week N" hiding). `tsc --noEmit`, `eslint src` and 439 tests pass. **`npm run build` has not been run** (a dev server holds port 3000). The user also confirmed Grand Finale "Next elim" behaves under a Spoiler-Free viewer who is behind. The live score reveal from the previous session is also still unchecked on a real episode night (see BACKLOG.md).

What shipped:
- **Manage Leagues:** titled "Manage Leagues" with the live "Week N" once under it (hidden but space-reserved for a Spoiler-Free viewer who is behind), stacked small Create / Join. One `LeagueTriageCard` per league: name + status pill, rank · pts, a Curtain Call / Dance Card / Grand Finale stack (emoji labels, right-aligned italic "Locked" / "Locks in …", gold "Need …"), then Make/Edit/Locked Picks, Open Standings, and an icon-only gear to League Settings. Due leagues get a slim gold left edge. Picks-due leagues sort first.
- **Home:** section is "Leagues This Week • N of M need picks / all caught up", link is "Manage ›" (inset to line up with the pills), rows tap to Picks when due else Standings (`leagueTapHref`), card end padding fixed.
- **League Settings:** Leave League now lives in League Info for everyone (commissioners see "Commissioners can't leave").
- **Refactors:** Home and Manage Leagues share `loadHomeLeagueData`; `LeagueStatusPill` is one component used on Home, the switcher and the cards.

## 2. Changes Made
Ours (all committed and pushed in `b4254a8`): `CLAUDE.md`, `src/app/leagues/page.tsx`, `src/app/leagues/[id]/settings/page.tsx`, `src/app/today/page.tsx`, `src/components/{home-dashboard,create-join-league-dialogs,league-info-section,league-switcher,league-status-pill,league-triage-card}.tsx`, `src/lib/{league-home-summary,home-league-data,league-module-stack-data,league-triage}.ts`, `src/lib/league-triage.test.ts`.
**Not ours, leave unstaged:** `ios/App/App.xcodeproj/project.pbxproj` (modified); untracked `scratch/` (`prefill-week3-draft.mts`, `league-settings-relocation-plan.md`, `draft-recast-handoff.html` are kept on purpose).

## 3. Key Decisions
- **Stack wording is the user's own spec** (`buildModuleStack`): Curtain Call "Need Home & High picks" (gold) / "Home: X" + gold "Need High" / "Home: X / High: Y" / "Missed your cue" (dim, locked) / "Opens after Week N results" / "Not open yet"; Dance Card "Draft not started" / "Draft in progress" / roster first names, with "Locked" once the draft completes; Grand Finale "Need predictions" / "Missed your cue" / "Next elim: {Celeb} & {Pro}" (first names, from the viewer's own order over spoiler-clamped couples) / "Prediction in". No "•" or "·" inside module phrases. Ignore double-elimination second Home slots.
- **Left button:** Make Picks (solid gold) when `picksDue`; Edit Picks (gold outline + faint tint) while any pick module is open; Picks Locked (flat, lock icon, disabled) once one has shut and none is open; hidden otherwise. Open Standings and the gear share `GOLD_OUTLINE` (60% gold border, full `accent` text, no fill). Don't change the shared dimming again without asking; opacity was flip-flopped several times.
- **No week delta / per-module points** on the cards (an earlier design was rejected). The Home curtain banner restructure stays on hold until its mock exists.
- **`weeksBehind` is viewer-level** (same value on every card); a "wk behind" pill is the Spoiler-Free-behind signal used to hide "Week N".
- **Vitest here doesn't resolve the `@/` alias**: pure files under `src/lib` that are tested must use relative imports.
- **Older rules still binding:** reveals are final, two viewer paths only (Spoiler-Free on/off), cut reveal UI stays cut; manager-earned points in Fraunces; only theme colors; Title Case for names, sentence case for sentences; couple entry card stays a plain render function.
- Never `npm run build` / `rm -rf .next` while a dev server holds port 3000. Shared working dir: `git fetch` + `git status -sb` first; stage by name, never `git add -A`.

## 4. Backlog & Next Steps
Deferred work is in [BACKLOG.md](BACKLOG.md), top of file in priority order: (1) check the live reveal on a real episode night and run `npm run build` once no dev server is running, (2) show the viewer's own points in Dance Card League at a Glance (verified still open), (3) split Scores and Enter Results into separate pages (verified still open). New "Manage Leagues follow-ups" section covers the held Home banner restructure and the deliberate double-elim omission.

`git fetch && git status -sb`
