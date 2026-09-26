# Session Handoff

## 1. Current State
**Everything is committed and pushed** (`60435fa` on `origin/main`; `git status` shows only the two files that aren't ours). `tsc --noEmit`, `eslint src`, 441 tests and `npm run build` all pass. **None of this session's UI has been seen running**: the container has no browser, and most states depend on the episode clock or on scores posting. Full list of what to check, and when, is the "Built but not checked" section at the top of [BACKLOG.md](BACKLOG.md); the next real episode is Tuesday 2026-09-29, 8pm ET / 5pm PT (West feed 11pm ET / 8pm PT).

Shipped this session (all Home / Spoiler-Free, all in that unchecked list):
- **Curtain restructure** (`49c0887`, `src/components/episode-banner.tsx`): fixed `h-48` banner with a `Week N · {show clock}` chip, white serif title (two size tiers), sub, and a seven-node NOW/NEXT rail. New copy from the designer's `curtain-copy.json` / DECISIONS.md (chip = show clock, title = league gate, sub = next hinge; PT/ET zone labels, relative day). The curtain's own sticky bar is gone. `west_soon` state now carries `westStartIso`; `seasonTrack` returns `marker: "now" | "next"`.
- **Spoiler-Free strip** (`src/components/spoiler-free-strip.tsx`): one line, pinned under the top bar; states Ready, Posting ("Week N posting live", pulsing dot), Watching live (no button). Its "Mark Watched" opens a bottom sheet: latest-first confirm, and with two or more unmarked weeks a "Choose an Earlier Week ›" vertical "I've Watched Through" list. `SpoilerRevealCallout` and its auto-opening dialog were deleted.
- **`LiveScoresPrompt`** (`72934f2`/`60435fa`): once-per-week sheet when a Spoiler-Free viewer opens Home with an unmarked posting week (Stay Updated / Mark Week N Watched, same operation; Dismiss per week per device). Home now auto-refreshes every 20s while any week is revealing or the West window is open.
- **Settings "I last watched" picker** moves the mark forward and back, lists fully published weeks newest first, and prefetches after paint (`useSpoilerProgress`) so page loads gain no queries.
- Create / Join buttons on Home reverted to solid + outline (`afe8716`).

## 2. Changes Made
Ours (committed in `49c0887`, `afe8716`, `72934f2`, `60435fa`): `CLAUDE.md`, `BACKLOG.md`, `src/app/today/page.tsx`, `src/app/settings/page.tsx`, `src/app/this-week/actions.ts`, `src/components/{episode-banner,spoiler-free-strip,live-scores-prompt,home-dashboard,create-join-league-dialogs,account-settings-sheet,spoiler-mode-toggle,watched-through-setting}.tsx`, `src/lib/{episode-banner,episode-banner.test,format-airs,spoiler-progress,use-spoiler-progress,use-persisted-state}.ts`; deleted `src/components/spoiler-reveal-callout.tsx`.
**Not ours, leave unstaged:** `ios/App/App.xcodeproj/project.pbxproj` (modified); untracked `scratch/` (`prefill-week3-draft.mts` fails lint on `any`, kept on purpose, so a full `npm run lint` reports 4 errors there and none in `src`).

## 3. Key Decisions
- **Curtain copy is the designer's contract** (`curtain-copy.json` + DECISIONS.md, restated in CLAUDE.md's Home curtain entry). Board PNGs are only a visual guide: state D (Results Soon) keeps the current week with rail **NOW**, and G (Pacific, during) shows the live dot and NOW. Curtain Call off: A/B read "Curtain Up Soon", C's sub is "Time to Vote". Title stays white (an earlier gold was reverted). Chip and title are allowed to differ now; don't merge them back.
- **The Picks Locked lock time stays the earliest lock across the viewer's leagues** (the user chose to keep it). With the default 0h lead it is unreachable (On Air Now wins at the same instant).
- **Mark is a single high-water week** (`last_watched_week`, `greatest()` upsert): marking Week N marks every earlier week too; only the Settings picker can lower it. Two prompt buttons ("Stay Updated — I'm Watching Live" / "Mark Week N Watched") do the same thing; framing only. The "Watching live" strip is derived from the mark already covering a posting week, so both look the same afterward.
- **Mark sheet description is one line everywhere** ("Scores, dances, and eliminations will show through this week.") except a still-posting week, which keeps "You'll see scores already posted, plus anything else posted tonight, including who goes home." "Choose an Earlier Week ›" only appears with two or more unmarked weeks.
- **Settings picker lists the four newest fully published weeks** (newest first) plus None, and keeps the current mark when it falls outside that window so its value always resolves; picking a lower week hides later results again. Helper is "Fell behind? Hide unwatched results." No queries on page load: data comes from a server action prefetched after paint. The Live Scores prompt, when earlier weeks are unmarked, ends "Both mark previous weeks as watched."
- **Strip is one line at 390px**, spelled "Spoiler-Free" (not "SF"), Home only for now; per-week "Mark as watched" buttons on Results/Picks/Recast stay until the strip is extended.
- **Casing:** Title Case for names, titles and buttons even where mocks show sentence case (CLAUDE.md rule beats the mock).
- **Multi-night weeks** (only Week 1 ever had two nights) are a parked question; game plan in BACKLOG.md, recommendation is to accept week-level marking.
- **Vitest doesn't resolve the `@/` alias**: tested `src/lib` files must use relative imports.
- **Older rules still binding:** reveals are final, two viewer paths only (Spoiler-Free on/off), manager-earned points in Fraunces, Title Case names / sentence case sentences, stage files by name, never `git add -A`. Never `rm -rf .next` or start a second dev server while one holds port 3000; check `ss -ltnp | grep :3000` first (a dev server was restarted at the end of this session and may still be running).

## 4. Backlog & Next Steps
Everything deferred is in [BACKLOG.md](BACKLOG.md). In order: (1) check the unchecked items on a phone / Tuesday's episode (curtain states, strip, prompt, picker, live score reveal); (2) extend the Spoiler-Free strip to Results / Picks / Standings and retire the in-context mark buttons (waiting on the user's judgement of Home first); (3) show the viewer's own points in Dance Card League at a Glance (verified still open); (4) split Scores and Enter Results into separate pages (verified still open).

`git fetch && git status -sb`
