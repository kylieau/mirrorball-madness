# Session Handoff

_Last updated 2026-09-21 (evening). Real drafts are 2026-09-22. Read this first, then `CLAUDE.md`._

## 1. Current State

**No feature in flight.** This session (a) recalibrated and rebuilt Grand Finale scoring, and (b) did a long
run of UI/UX work: Dance Cards rosters, module order, Settings, copy. All of it is in commit `f69ce5b`
("Recalibrate Grand Finale scoring methods, add Dance Cards, unify module order, move Reset Draft into League
Settings"); `tsc`, eslint and `npm test` (287) are clean and the build was run. The user clicked through the new
screens and approved them; only the **Results-tab couple notes** wording change (`coupleLeagueNotes`) and
League Settings **Reset Draft** were not confirmed live.

Live DB is current: `supabase/apply-grand-finale-scoring-methods.sql` was run and verified (all 6 leagues now
`distance_based` / penalty 50 / 200 pts / `equal` pay; new column `bonus_picks_tier_pay_style`; `binary_tier`
→ `band_tier`; `update_scoring_categories` has a new last arg). `types.ts` was regenerated from the live schema.

## 2. Changes Made

Source of truth: `git show --stat f69ce5b` (75 files, +1939/−565). Working tree now has only `ios/App/App.xcodeproj/project.pbxproj`
(not ours) and untracked `scratch/` (verification scripts, e.g. `check-gf-settings.mjs`, `verify-gf-methods.mjs`).
Highlights:
- **Grand Finale scoring:** `scripts/monte-carlo-calibration/run.mjs` (+README) scores all methods; `src/lib/scoring.ts`
  (`bandOf`, `bandPayoutFraction`, `band_tier`); `src/lib/grand-finale-explainer.ts` (defaults, credit table, band preview,
  copy); `league-modules-form.tsx`; `supabase/schema.sql` + new `supabase/apply-grand-finale-scoring-methods.sql`;
  `results.ts`, `season-clock-sync.ts`, settings `actions.ts`, `types.ts`.
- **Rosters ("Dance Cards"):** new `league-rosters-card.tsx`, `league-rosters.ts`, `roster-couple-points.ts` (+tests); on the
  draft-complete page, the Standings tab (`#rosters`), linked from Your Picks; `roster-card.tsx` ("Your Fantasy Roster") got
  its own week carousel (`?rosterWeek=`).
- **Module order + titles:** new `src/lib/scoring-modules.ts`; Settings/create dialog/Standings/Picks all follow it.
- **Draft UX:** `draft-away-note.tsx`, `draft-managers-card.tsx` (`Auto` badge), `draft-status-card.tsx`, `draft-room.tsx`,
  pick log no longer labels auto picks; Reset Draft added to League Settings → Danger Zone (`league-info-section.tsx`).
- **Settings/Account:** sticky header + fixed Save / Save & Exit bar; new `settings-section.tsx`, `league-settings-links.tsx`;
  League settings now reached from Account settings (gear icons removed); `account-settings-data.ts` carries `leagues`.
- **Copy:** Title Case sweep across ~75 labels; Results notes via `src/lib/couple-league-notes.ts`; "Appearance" row removed.
- **Also in the commit but not from this chat:** EpisodeBanner decorative motion + `globals.css` keyframes removed.

**Git:** `main` is 1 commit ahead of `origin/main` before this handoff commit; pushing publishes `f69ce5b` too.

## 3. Key Decisions & Lessons Learned

- **Grand Finale calibration was exact-only** — distance-based (penalty 2 on a 257 base) paid ~250 for everyone, zero spread.
  Now each method solves its own points to the same variance budget: distance 200 (penalty 50, 0 credit at 4 off), exact 257,
  band_tier 162 equal / 252 graded. **Distance-based is the default for all leagues** (user chose "all leagues"). Guess-noise
  (`GF_ORDER_NOISE_SD = 3`) is illustrative — re-fit with real Season 35 picks.
- **`band_tier`** replaced top-N `binary_tier`: bands of N couples from the winner down; pay if predicted band == actual band;
  graded = 100/75/50/25% (floor 25%).
- **Week 1 Dance Card scoring for late drafts: deliberately left as is** (scoring starts at the first unaired week). Week 1 is
  <1% of standings spread. If revisited: `judges_score_starts_week` also anchors the **Grand Finale deadline**, so it needs a
  separate scoring-floor column, a "counts only if the draft finishes before Week 2 airs" rule, and a rescore hook
  (`applyEpisodeResults` is server-only). Curtain Call scoring/locks are already independent of the Grand Finale deadline.
- **Module order = Curtain Call → Dance Card → Grand Finale everywhere** (weekly-actionable first; user's call over my
  "foundation first" argument). Card titles: **Your Weekly Pick 'Em** (+ invite line while picks are open), **Your Fantasy
  Roster**, **Your Season Bracket** ("bracket" is deliberate — a full up-front prediction, like March Madness).
- **Per-couple points are judges' points only** (survival/placement stay manager-level; the card says so).
- **Capitalization rule:** labels/titles/buttons Title Case; phrases and sentences stay sentence case (in `CLAUDE.md`).
- **Don't run `prettier` here** — no repo config, it reformats whole files. Hand-indent.
- **`vitest` has no `@/` alias:** modules under `src/lib` must import each other relatively.
- **`tsc` errors under `.next/types`** while `next dev` runs are transient; ignore/retry. Dev overlay
  `__webpack_modules__ … is not a function` = stale `.next`: `rm -rf .next`, restart dev, hard-reload.
- **Don't `npm run build` while `next dev` is on :3000** (shares `.next`).
- **Working style:** repeat back before executing when asked; one question at a time; a rejected `ExitPlanMode` means stop and
  wait; stage files by name (never `git add -A`); hand SQL over as plain `.sql` files.

## 4. Backlog & Deferred Items

- **Confirm Vercel deploys** for `f69ce5b`/this push succeeded (past builds broke silently — check the Deployments list).
- **Throwaway fixtures may still be live:** league "Draft Test (throwaway)" (`d39b26a3-1076-48d0-b07e-2a143acf31f7`) and auth
  user `draft-test-manager@example.test` (`9d7484e9-8199-4427-89db-56a72d6b9afe`). Delete the league first (cascades), then the user.
- **A Supabase access token was pasted into the chat — revoke it** (supabase.com/dashboard/account/tokens); put a fresh one in
  `.env.local` as `SUPABASE_ACCESS_TOKEN` if needed for `types.ts` regeneration.
- **Live draft cue:** a live draft is only flagged in the Dance Card section's `DraftStatusCard` (now below Curtain Call); consider
  a cue in the league header/Today.
- **Settings "✓ Settings saved" banner** doesn't clear when fields are edited afterwards.
- **Results notes:** bolding league names (e.g. "On your **matt with the stars** roster") would separate them from the noun.
- **Auto-picks aren't announced** in the draft UI; no timer refetch for a silently stalled connection.
- **Site Admin visibility:** the user wants some Site Admin pages moved public; scoped, not started.
- **Calibration** should be re-run against real Season 35 data (see `scripts/monte-carlo-calibration/README.md`).

## 5. Next Steps

1. Check the push landed and Vercel's build is green (see §4), then watch the real drafts on **2026-09-22**.
2. After the drafts, delete the throwaway league/user, and make sure the Supabase token is revoked.
3. Pick the next task from §4 (suggested first: a live-draft cue outside the Dance Card section).
