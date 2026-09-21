# Session Handoff

## 1. Current State

**Cross-league picks built, uncommitted, browser flow not yet exercised.** "Also save
to…" and "Use my picks from…" on the Curtain Call and Grand Finale forms (see the
CLAUDE.md bullet). Verified: `tsc`, eslint, `npm test` (14 new tests in
`copy-picks.test.ts`), and a live throwaway-account run
(`scratch/copy-picks-live.mts`, via `scratch/vitest.live.config.mts`; cleanup
confirmed). Not verified: clicking through the two forms in a signed-in browser. Files:
`src/lib/copy-picks.ts`, `src/lib/other-league-picks.ts`,
`src/components/other-leagues-picker.tsx` (collapsed toggle → one row per league; the user
approved this design after trying chips), plus edits to `actions.ts`, `pick-em-box.tsx`, `grand-finale-box.tsx`, and the
league `page.tsx`. Stage by name when committing. Next: click-through, then commit.

Earlier, prior session — **no feature in flight.** It shipped two things and then scoped a third:
1. **Grand Finale picker** (pushed, `74e8193`): stays open until the hard deadline;
   couples whose elimination is already *revealed* to the viewer are pinned first
   and immovable, so the viewer ranks only the still-competing couples. Selection
   step is a 2-column list under a "your order so far" list. Listing all 16 couples
   is by design (full-order ranking; the RPC requires every couple once).
2. **Season 35 schedule** (live in the DB, file added this commit): Weeks 3-11 with
   themes and air times. The stray "test" Week 3 was *retitled* Yacht Rock Night,
   not deleted (the user had already edited its date to Sep 29).
3. **Site Admin visibility** (scoped only, deliberately not started): the user wants
   to move some Site Admin pages into public view and asked to do it in a new session.

## 2. Changes Made

`git diff --stat 9fe610b HEAD` (session start to `eecc627`):
- `src/components/grand-finale-box.tsx` — pinning + 2-column selection grid
- `src/lib/grand-finale-pins.ts` — **new**: `pinnedEliminatedIds`, `pinEliminatedFirst`
- `src/lib/grand-finale-pins.test.ts` — **new**, 4 tests
- `supabase/revert-grand-finale-lock.sql` — **new**: restores the original
  `effective_grand_finale_deadline` (already run by the user)
- `CLAUDE.md` — Grand Finale bullet describes pinning
- `MEMORY_HANDOFF.md` — this file

Added in this commit: `supabase/apply-season-35-schedule.sql` (already run live;
Weeks 1-11 verified by read-only query).

Uncommitted and not ours: `ios/App/App.xcodeproj/project.pbxproj`, `scratch/`.

## 3. Key Decisions & Lessons Learned

- **A Grand Finale lock was built, run live, then reversed.** The user first chose
  "lock at first reveal", then decided it shouldn't lock and chose "stay open, pin
  eliminated couples". Don't reintroduce an elimination-based lock.
- **Pinning is UI-only.** The RPC can't enforce it without per-viewer spoiler
  progress. Unrevealed eliminations are deliberately not pinned (spoiler safety, via
  `spoilerSafeCoupleStatus`). Same-week eliminations pin in name order.
- **Eliminated status only appears on the saved/locked GF summary**, never in the
  select step, so "preview doesn't show eliminated couples" is expected.
- **Service role can't call `effective_grand_finale_deadline`** (granted to
  `authenticated` only). Verify from tables or a signed-in session.
- **Schedule conventions:** shows air Tuesday 8pm ET = 00:00 UTC next day (01:00 UTC
  after DST ends Nov 1); an episode's `theme` mirrors its week's `theme`.
- **Re-read live data before acting on an earlier read.** Episode 4's date changed
  between my two reads (the user edited it), which made a planned delete wrong.
- **Spoiler-Free callout** = the gold Home banner + auto-opening "Mark as watched"
  dialog (`spoiler-reveal-callout.tsx`) shown when a completed week is unwatched.
- **Plan mode:** the user rejects `ExitPlanMode` when they don't want to proceed in
  that session; treat that as "stop", and restore any plan file you overwrote.
- **A parallel session shares this tree** (it swept one of my `CLAUDE.md` edits into
  its commit). Stage by name; never `git add -A`.
- **Don't `npm run build` while `next dev` listens on :3000.** Use `tsc --noEmit`,
  eslint and `npm test`.
- **Live DB writes are blocked from this container.** Hand over plain `.sql` files
  for the Supabase SQL Editor; verify with read-only service-role `.mjs` scripts run
  from the project root with `NODE_OPTIONS="--experimental-websocket"`.

## 4. Backlog & Deferred Items

- **Site Admin visibility** (next task). Current state: `/admin/results` (Enter /
  View / Schedule / Settings tabs) opens to any signed-in user when
  `RESULTS_ENTRY_OPEN_TO_ALL=true` but is linked only from `SiteAdminNav`
  (super-admin only, in Settings). `/admin/accounts` is strictly super-admin. All
  results writes use the service-role client and affect every league.
- **Assumed schedule dates** (not given by the user, editable on Admin > Schedule):
  Week 5 Oct 13, Week 10 (Semi-Finals) Nov 17, Week 11 (Finale) Nov 24. Week 5 has
  no theme (TBA).
- Spoiler-Free callout on `/today` still to be confirmed by the user.
- Server-side pin enforcement for Grand Finale is deferred.
- Older items: Monte Carlo re-run against real Season 35 data once more weeks exist
  (`scripts/monte-carlo-calibration/README.md`); `dance_card_calibration` clamp path
  (roster size outside 1-6) never exercised live.

## 5. Next Steps

1. Run `git status` and `git fetch && git log HEAD..origin/main` first.
2. Decide the Site Admin scope with the user. My recommendation: a **read-only
   public Schedule** (episodes by week, themes, air times) linked from the Home
   episode banner, not under `/admin`. Skip a public View Results (duplicates
   `/this-week`, would need `resolveSpoilerCutoff`). Keep Accounts, the Settings tab
   and Enter/Publish Results gated; later replace `RESULTS_ENTRY_OPEN_TO_ALL` with a
   per-person "results editor" flag on `profiles` (a column users can't write, per
   the column-grant rule in `CLAUDE.md`).
