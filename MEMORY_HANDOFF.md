# Session Handoff

## 1. Current State
**Three small, independent polish items landed on top of the Home hybrid redesign — all committed, pushed, and verified.** Local `main` == `origin/main` at `12677e4`. Between the last handoff (`ed0d0b9`) and now, other sessions independently shipped PRs `#40`–`#47` (Home moved to serve at `/`, the full "Your Leagues" hybrid-card redesign, League Settings scoring IA flattening, and — merged in mid-session here, zero conflicts — module-toggle even-split weights + Reset to Neutral). None of that is this session's work; `CLAUDE.md`/`BACKLOG.md` already document it.

This session's own three changes, each verified with `tsc`/`lint`/`npm test` (511 passing)/`npm run build`:
1. Removed the "Picks close in" line and per-card "Week N" label from Home, deleting the now-fully-unused plumbing behind both (not just hiding the text) — `f02fa52`.
2. Added Create/Join League buttons to the Account Settings sheet's League Settings list (`LeagueSettingsLinks`), filling the gap left when Home's hybrid redesign intentionally dropped them for 2+-league viewers — `b9da466`, then corrected to the real filled/outline button style after the user caught it rendering as muted ghost buttons in a live browser check — `12677e4`.
3. Shortened the curtain banner's Picks Open/Locked sub-copy from "Live On Air" to "Live" — `8dc245f`, picked up from a different concurrent session's already-written plan file (see §3) at the user's explicit request to implement it here too.

## 2. Changes Made
**Ours:** `CLAUDE.md`, `src/app/page.tsx`, `src/components/home-dashboard.tsx`, `src/components/league-triage-card.tsx`, `src/lib/league-home-summary.ts`, `src/lib/league-triage.ts`, `src/lib/league-triage.test.ts` (item 1); `src/components/league-settings-links.tsx` (item 2, two commits); `src/components/episode-banner.tsx` (item 3).
**Not ours, merged in from PR #47 (Push Pilot, parallel Grok/Cursor cloud session):** `src/components/league-modules-form.tsx`, `src/components/scoring-module-panel.tsx`, `src/lib/scoring-neutral.ts` + test, `supabase/schema.sql`, `supabase/apply-lock-judges-score-multiplier.sql`, `supabase/apply-reset-scoring-neutral.sql`, `BACKLOG.md` — confirmed zero file overlap with our own changes before merging.
**Not ours, leave unstaged:** `ios/App/App.xcodeproj/project.pbxproj` (modified, pre-existing); untracked `scratch/` (`prefill-week3-draft.mts` fails lint on `any`, kept on purpose).

## 3. Key Decisions
- **Home's 2+-league Create/Join omission stays intentional.** Confirmed with the user rather than re-adding buttons to an already content-dense Home: the fix for discoverability is the Settings sheet footer (item 2 above), not undoing the hybrid redesign's `homeLeagueChrome` split (1 league → quiet buttons under the card; 2+ → "Manage ›" only).
- **Settings sheet Create/Join buttons must use the real button style**, not `CreateJoinLeagueDialogs`' `quiet`/ghost variant — the user explicitly rejected ghost buttons there after a live check. Use the default (no-props) variant, same as Manage Leagues.
- **The user deliberately keeps `/leagues` around** even though Home's hybrid cards now duplicate its content for 2+-league viewers — an intentional revert path in case many-league users dislike the uncapped card stack ("the move was based on small-numbered league membership"). Don't re-propose retiring `/leagues`.
- **Multi-session coordination on this repo is active and real, not hypothetical.** "Push Pilot" is the user's name for a parallel Grok/Cursor cloud session working League Settings scoring-weight UI — don't touch that code without coordinating. Separately, a *different* concurrent Claude Code session had its own plan file at `/home/node/.claude/plans/i-think-i-want-transient-blum.md` (the curtain-copy tweak) that the user had this session execute directly — plan files under `/home/node/.claude/plans/` can be cross-session discovery points on this shared machine, not just this conversation's scratch space.

## 4. Backlog & Next Steps
Nothing new deferred — everything asked for this session shipped. `BACKLOG.md` is otherwise unchanged by this session; its existing items stand. Worth a final human glance (no browser in this container): confirm the Settings sheet footer's button style change looks right at both 1-league and 2+-league accounts, and that the curtain sub-copy reads "Live · {day time}" correctly during a Picks Open/Locked window.

`git fetch && git status -sb`
