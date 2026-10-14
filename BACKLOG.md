# Backlog — to be dealt with later

Things explicitly deferred during development, not tracked anywhere else. Not a full feature roadmap — just the "don't forget this" list.

## Performance audit — 2026-10-14

**#1 below is implemented, verified and pushed to main in `82fea94`** (deployment not yet confirmed) (`league-home-summary.ts`, Picks `page.tsx`, `this-week/page.tsx`, `revealing-week-data.ts` and its four callers). Production build, `eslint src` and 609 tests pass. Signed-in before/after SSR comparison (2026-10-14, during the E06 reveal, scratch viewer in two leagues: one locked/drafted/GF on, one West-coast open/undrafted/GF off; Spoiler-Free off gated, on gated, on watched through Week 4, off with drafts unlocked; Home, Results, both Picks and Standings, Manage Leagues): HTML identical apart from countdowns, random empty-standings taglines and a couple posted mid-run. Dev-mode medians, before → after: Home 2.7 → 2.2s, Picks 3.6 → 3.0s (locked) and 3.2 → 2.9s (open), Results 1.6 → 1.4s, Standings and Manage Leagues within noise. `npm run lint`/`npm test` also pick up another session's `.codex-private/` folder (lint errors, 8 failing test files); that's unrelated to this change.

**#2 is implemented, verified and pushed to main in `fc08b22`** (deployment not yet confirmed). `src/lib/viewer-season-data.ts` holds per-request `React.cache` loaders (active season, spoiler progress with both marks, weeks/episodes, the viewer's memberships, all couples). `loadDraftScoreContext`, `resolveSpoilerCutoff`, `getAccountSettingsData`, `loadOtherLeaguePicks`, the module-stack loader and the Home/Results/league/Score History loaders read through them. The draft context and Picks/Results roster reads now overlap the cutoff instead of running before it. Nothing is cached across requests. Same SSR comparison as #1, but run 2026-10-14 after E06 was officially published (05:01 UTC), so it had no open-picks state, no revealing week and no released drafts (the drafts-unlocked state rendered with nothing to unlock). Re-check Home/Results/Picks/Standings with a released draft and a live-revealed couple on the next live night (E07): all 28 page/state pairs identical apart from countdowns and taglines. `loadScoreHistory` output matched too, but the scratch league had no history lines, so that only shows it runs. Dev-mode medians on fresh servers, before → after: Picks 3.2 → 2.2s (locked) and 2.3 → 1.9s (undrafted), Standings 1.9 → 1.3s and 1.5 → 1.2s, Results 1.2 → 1.0s, Manage Leagues 1.8 → 1.5s, Home unchanged (~1.9s). Build, `eslint src` and 609 tests pass. `getUser()` still runs more than once per render.

Static trace of Home, Results, Picks and Standings plus the dev server's `.next/trace` (the only log available; Vercel logs weren't reachable from the container). **Measured** (dev mode, one viewer, container → Supabase, so shape only, not production numbers): during the E06 East broadcast, Home auto-refresh RSC renders took 2.4–4.5s (n=6, 01:48–01:50 UTC) at a ~23s cadence; Picks RSC renders 3.6–6.8s (n=9, two outliers 11.5s/24.8s); Results 0.9s (n=1). Each request also shows a short 0.1–0.7s span the trace doesn't explain. **Code-derived**: every fan page re-runs its whole loader on each 20s `router.refresh()`; there is no cross-request caching anywhere (correctly so). **Hypothesis**: DB load = viewers × ~30–60 queries per 20s; viewer count and DB metrics unknown, so no claim the database is saturated.

Do **not** add cross-request caching (`unstable_cache`, fetch cache, `"use cache"`) for episodes, weeks, dance scores, results, predictions or spoiler progress: `episodes.status`/`results_published_at`/live `dance_scores` drive the spoiler cutoff and reveal state, and the reads run under each viewer's RLS. React `cache()` (per request) is the only dedupe proposed.

Top three, in recommended order:

1. **Flatten serial waterfalls (implement first, after the episode).** Pure reordering: same queries, RLS and data.
   - `computeLeagueHomeSummary` (`src/lib/league-home-summary.ts`) runs up to 5 serial rounds per league (settings/members/scores → roster_slots → `effective_grand_finale_deadline` → `prediction_lock_at` + own prediction → own GF pick). The two RPCs need only league/week id, so they belong in round one; the rest go in round two after `myTeamId`. That gives 2 rounds, on Home's critical path and the league switcher's.
   - Picks after `loadLeaguePageBase` (`src/app/leagues/[id]/picks/page.tsx:95-499`) awaits about 14 queries one by one. Group them into two stages: independent reads first (GF deadline, lock, own prediction, own GF order, dance scores, jeopardy, own/league roster slots, draft-pick count), then reads that depend on the lock or deadline (peer predictions only when `isLocked`, late unlocks and peer GF picks only when GF is locked, other-league picks, recap). Keep peer reads conditional exactly as now.
   - Results: the predictions/GF reads (`this-week/page.tsx` after line 186) don't depend on the dance/results reads before them, so the two `Promise.all` calls can merge.
   - `loadRevealingWeek`'s dance_scores query needs only grouped weeks, not the cutoff, so it can run alongside `resolveSpoilerCutoff`.
   - Validate by rendering the same viewer before and after (Home with 2+ leagues, Picks locked and open, GF on/off, Spoiler-Free on/off, a revealing week): the HTML must match, and `.next/trace` render time should drop. Risk: an accidental unconditional peer-pick read (RLS still gates it, but the UI keys off `isLocked`).
2. **Request-scoped viewer/season context.** Each page reads several things twice:
   - viewer's `league_members` (3× on Picks, via `loadOtherLeaguePicks`)
   - `active_season_id`
   - `competition_weeks` + `episodes` (once in `loadDraftScoreContext`, once in the page loader)
   - `spoiler_watch_progress` (`draft_unlocked_week` and `last_watched_week` in two queries)
   - `couples` (twice on Home, plus `loadLatestRelease` while drafts are out)

   Also, `loadHomeLeagueData` makes weeks/episodes wait for the whole `loadDraftScoreContext` chain. Fix: one per-request `cache()`d loader passed into `loadDraftScoreContext`, `resolveSpoilerCutoff` and the page loaders.

   This saves roughly 6–8 queries and 2–3 serial rounds per render on every fan page. It's riskier than #1 because it touches the draft/spoiler context all four pages share. Validate across the same viewer states as #1, plus draft-released/unlocked and East/West live-air states.
3. **Take the league-switcher summaries off the Picks/Standings critical path.** `loadLeaguePageBase` runs `computeLeagueHomeSummary` (3–8 queries each) for every *other* league on every render and refresh, only to fill rank/Picks Due in a sheet that's usually closed (`league-switcher.tsx`). Options:
   - Load them in a server action when the sheet opens. The action must re-derive the cutoff server-side.
   - Pass an unawaited promise behind Suspense.

   Separately, `loadOtherLeaguePicks` (`src/lib/other-league-picks.ts`) recomputes `prediction_lock_at` / `effective_grand_finale_deadline` for those same leagues, so reuse base's values or batch them.

Ride-along flags (behavior questions, not perf, so decide separately):
- **Switcher rank ≠ Home rank on a live night.** `loadLeaguePageBase` passes `cutoff.allowedEpisodeIds` to `computeLeagueHomeSummary` but not `scoredIds`/`revealingWeekId`/`draftNight`, which Home passes. Decide whether to align before or with #3.
- **Home refreshes in more cases than the other pages.** Home's `RevealAutoRefresh active={!!revealing}` (`(fan)/page.tsx:246`) refreshes for gated viewers and after the live window while revealed-but-unpublished scores remain. Results and the league pages use `revealingVisible`. How often this matters is a hypothesis.
- **Refreshes can overlap on slow renders.** `RevealAutoRefresh` restarts its interval whenever `windows` gets a new array identity (each refresh), hence the measured ~23s cadence. A render slower than 20s (dev outliers 19.1s/24.8s) can overlap the next tick.
- **League pages re-read data they already have.** `draftManagerScoresForLeague` re-reads `scoring_settings` and `roster_slots` that the base already loaded. Picks' own and league `roster_slots` queries are derivable from `leagueSlotPeriods` + `flatCouples` once the draft is complete.
- **`getUser()` runs three times per render** (already noted in item 8). SiteHeader's call runs in parallel with the page's, so it costs requests, not latency; a `cache()`d getter in the same request removes one.
- **Not bottlenecks at current scale** (code-derived): `couples` reads without a season filter, `select("*")` on `leagues`/`scoring_settings`, the season's `weekly_manager_scores`, missing indexes, and the per-row `prediction_lock_at` in the predictions RLS policy.
- **Later, if load matters**: refresh only when a cheap "live version" (latest `dance_scores.created_at`, release and publish stamps) changes, instead of every 20s. Clock-driven chrome (East→gap→West) is computed server-side with `now`, so this needs care to avoid missing those transitions.

## Code review — 2026-10-13

All three fixes are committed and pushed to main in `384f78d`; deployment not yet confirmed. `npm test` passes 609 tests across 55 files; lint, type check and production build pass. Chromium exercised the real ResultsForm with isolated fixtures/mocked actions: a newer edit survives an in-flight save, and Publish flushes the latest values. No live data changed. The PostgreSQL tests run in PGlite (dev dependency) against the project schema and migration.

- **Autosave edit loss fixed**: `DraftSaveQueue` (`src/lib/draft-save-queue.ts`) tracks per-couple edit revisions, serializes saves, drains newer edits before publish/release, and keeps failed edits dirty for retry. Episode switching waits for saves; fields lock while publish/release is busy. Queue tests cover overlapping flushes, failures and episode changes.
- **Partial publication fixed; migration verified live**: `publishEpisodeAtomically` (`src/lib/episode-publication.ts`) prepares all score rows through `buildWeeklyScoreRows`; service-only snapshot/commit RPCs persist results, standings, couple status, future-cast pruning, metadata, moments and draft cleanup together. A changed snapshot or failed write aborts the transaction. PostgreSQL tests cover rollback (including corrections), stale-input rejection, permission checks, revealed-score preservation, guest scaling, anchor week, multi-night scores and Grand Finale. **Migration applied by the user and verified live**: snapshot RPC succeeds and both RPCs appear in the API schema; types regenerated. No real episode was published as a test; observe the next real publish after deployment. Missing RPCs fail before any live write.
- **Redirect validation fixed**: `safeRelativePath` rejects backslashes/control characters and checks the resolved origin. Regression tests cover the `/\example.com` authority bypass and valid local paths.

## Spacing pass — 2026-10-13

Committed and pushed to main in `384f78d`: removed duplicated PageHeader margins, standardized 12px section/card vertical spacing, reduced 24px module/settings gaps to 16px, aligned Picks/Standings sticky chrome with Home/Results, and made the Home curtain and activity feed content-sized. Horizontal gutters, fonts, controls and bottom-navigation clearance remain intact. Before/after screenshots of Home, Results, Picks, Standings and Manage Leagues at 360px/390px are in `/tmp/dwts-spacing-before` and `/tmp/dwts-spacing-after`. These are temporary artifacts; the scratch league/accounts were removed after validation. Narrow-phone (320px), 390px and desktop (1024px) checks found no page-wide horizontal overflow across fan/settings/admin screens; long standings names stay within two collapsed lines and show their full text when expanded. Lint and production build pass. Publication migration is now applied and verified live.

## Up next, in order

1. **Check the Spoiler-Free strip's new mounts on Results and the league hub (Picks/Standings) in a real browser** — see "Spoiler-Free strip: extended past Home" below for the full rundown; this container has no browser so none of it has actually been seen rendered.
2. **Check tonight's Enter Results (admin) changes in a real browser** (`e8f2216`, `1f531bc`) — the merged Publish/Save-as-Draft-Score row, the Episode Details-under-Week-select layout (Air Date only, with timezone), the Finish Week / Special Moments accordions (collapsed by default), and the Season Elimination Order card now on the landing page: Grand Finale row styling minus the points pill, "Week N" status wording, winner-first (#1) down to the first couple eliminated (#N) — the numbering went through four rounds of correction (direction, then a real off-by-cast-size bug where mid-season numbers were computed off however many couples had resolved so far instead of the full cast), worth confirming a real mid-season view shows season-wide positions once seen rendered.
3. **Check tonight's Picks-tab and Results-tab changes in a real browser** (`2547def`, `7a29820`) — this container has none, so nothing below has been seen rendered: Your Fantasy Roster header now week-scoped (not season total), Curtain Call's saved-state row layout, Your Season Bracket's collapsed peek vs. "Display Full Bracket" unwindowed expand (went through several rounds of screenshot-driven correction, worth a careful look), and the Results page's new gold lines (Grand Finale "bracket next-elim pick" / "winner pick", the all-leagues/"N leagues'" collapsing, "elim pick" shortening) — confirm wording reads cleanly at real card width and the winner-pick line only shows up in semi-final/finale weeks.
4. **Check everything in "Built but not checked" below**, starting with Tuesday's episode (live score reveal, curtain states, Spoiler-Free strip and prompt).
5. **Click through the Scores / Enter Results split** (`/admin/results`, `/admin/results/enter`) as a plain viewer, a commissioner and the site admin: nav links from Settings, Back to Scores, "Continue in Enter Results" landing on the right week, autosave and Publish still working after the page split (autosave relied on the old single-page refresh behaviour). Checked without a browser: build and signed-in fetches for a viewer (redirected away from /enter) and a commissioner (renders).
6. **Click through the Picks / Standings route split on a phone.** Picks and Standings are now separate routes (`/leagues/[id]/picks`, `/leagues/[id]/standings`; `/leagues/[id]?tab=` redirects). Checked without a browser: build, redirects with params carried over, and a signed-in fetch of both pages (titles, bottom-nav links, Standings free of picks content, justCreated card, Home/Results nav links, Settings close link). Not yet seen: tapping between the tabs, Back button behaviour, the league switcher sheet keeping you on the same tab, the Curtain Call / roster carousels paging on `/picks?week=…&rosterWeek=…`, and a pick or Recast submit refreshing the page.
7. **Live-air follow-ups the user hasn't decided on:**
    - Settings → "I last watched" moved to the current week still does a full unlock (`unlock_draft_scores_through`) mid-East, while the prompt's Mark Watched is gray. Offered to lock the picker for the on-air week; no answer yet.
8. **Check the install/speed/frame pass on a real phone and laptop** (`edfef79`, `1e24dfd`, `28ce2da`): confirm the Vercel deploy is Ready; remove and re-add the home-screen shortcut to see the new icon (iPhone caches the old one); tap each fan tab and confirm the skeleton paints at once; on a laptop confirm the tab bar, the Enter Results sticky Publish bar and bottom sheets stay inside the 30rem column; check the 20px top-bar glyph reads at that size. Nothing was timed, so also measure real page load before claiming a speedup. Add the touch pass (`polish/native-touch-css`, `217e4ee`) to the same phone check — Chromium can't show any of it: taps give instant pressed feedback on list rows and nav icons (no 300ms-ish zoom wait), no rubber-band past the frame edges and no pull-to-refresh, the Spoiler-Free strip pill and the draft-scores "i" are comfortably hittable with a thumb, and the sticky top bar stays pinned while scrolling each tab with no strip showing (no gap or double bar under the iOS safe area). Follow-ups the user hasn't asked for: the native iOS app icon still comes from the old purple `assets/icon.png` (touches the in-progress Xcode project); the logo pack's wordmark and stacked splash are unused and unlocked; a first-run tips overlay was offered and declined for now; the duplicate `getUser()` calls (middleware, `SiteHeader`, page) were left in place.

## Built but not checked in a browser or on a real episode (needs a phone, or Tuesday's episode)

Everything below is committed and pushed (`49c0887`, `afe8716`, `72934f2`, `60435fa`), passes `tsc`, `eslint src`, 441 tests and `npm run build`, and was never seen running: the container has no browser, and the states depend on the episode clock or on scores posting. Next real episode: Tuesday 2026-09-29, 8pm ET / 5pm PT (West feed 11pm ET / 8pm PT).

- **Home curtain** (`episode-banner.tsx`, copy in `statusCopy`). Only one chip state has been seen on a phone. Check each of the seven states (Picks Open, Picks Locked, On Air Now, Hold the Curtain, West Coast "Let's Dance", Results Soon, Scores Are In): the `Week N · {chip}` fits on one line beside the live dot (C and G), the fixed `h-48` height holds a two-line title ("Hold the Curtain", 💃Let's Dance🕺), the sub's viewer-local time reads "Today 5 PM PT" style, and the seven-node rail's NOW/NEXT label sits correctly (A, B, F, E = NEXT; C, D, G = NOW; D stays on the current week). A time-mocked check of all states (feed `EpisodeBannerInput` fixtures at 390px) was never done. Picks Locked is only reachable when a league sets a lock lead above 0 hours, or on Night 2. Curtain Call off swaps in "Curtain Up Soon" / "Time to Vote" copy (unseen).
- **Spoiler-Free strip on Home** (`spoiler-free-strip.tsx`): Pattern B + Soft inset — sticky wordmark + avatar, mauve strip with one hairline directly under it. Posting copy is "Spoiler-Free · Week N posting live" and must stay on one line at 390px. Ready and Watching-live states are unseen. Caught-up viewers see no strip, just the plain pinned wordmark + avatar bar (`StickyTopBar`, same on all four fan tabs).
- **Mark sheet**: single-week vs two-or-more-weeks-behind flows, "Choose an Earlier Week ›", the vertical "I've Watched Through" radio list, "Mark Through Week N", plain-text (no hover button) links, and the always-latest default. Live-posting week keeps its own description ("…plus anything else posted tonight, including who goes home"); every other case reads "Scores, dances, and eliminations will show through this week."
- **`LiveScoresPrompt`** (`live-scores-prompt.tsx`): rebuilt 2026-09-29 as the live-air prompt and checked live on that episode by the user (punch list passed; a couple of fixes landed live).
- **Settings "I last watched" picker** (`watched-through-setting.tsx`, `use-spoiler-progress.ts`, `spoiler-progress.ts`): lists the four most recent options (newest first), treating None as week 0 so it appears only while it is still inside that window, and keeps a later current mark when it falls outside that window; moves the mark forward or back, prefetches after paint. Check there is no pop-in or lag when the sheet opens, that the disabled "…" placeholder is brief when toggling Spoiler-Free on, and that a live-marked week still shows as the current value.
- **Create / Join buttons on Home**, non-quiet path (Account Settings, Manage Leagues): reverted to solid + outline at `xs` size (`afe8716`); the older larger size was not restored. Separate from — and still open after — the one-league quiet-buttons fix below.
- **Bottom fade on inner scrollers** (`ScrollFade`, `e5aabcb`) still unchecked on a device.
- **Live score reveal** (per-couple publish/undo, Finish Week) still needs a real episode night, ideally a low-stakes one; see its section below.

## Manage Leagues (`/leagues`) follow-ups

Shipped in `b4254a8`; the user checked it on their phone. Still open:

- **Home curtain banner restructure** shipped (status-first curtain, `49c0887`); it is in the unchecked list above.
- **Double-elimination weeks:** the Curtain Call stack only tracks Home and High; the second Home slot (`predicted_eliminated_couple_id_2`) is ignored on purpose, since a double is only known once the episode airs.
- **Module status wording** is the user's spec (`buildModuleStack`, `src/lib/league-triage.ts`); change it there, tests are in `league-triage.test.ts`.

## To check: Schedule settings that used to live on Enter Results

- **Judges' Save Active** now lives on the Schedule episode form (`episodes.judges_save_available`, no SQL needed) and Enter Results reads it; the switch is gone from Enter Results. Check it saves and that the Judges' Save column appears in Finish Week for that episode.
- **Guest judges + scaled judges points** (`e554bd2`, `e506707`, Joe Buck on E06): **stored values verified live 2026-10-14** — all 11 published E06 `dance_scores` rows have 4 judge scores and `scaled_score` = total × 3/4 (e.g. 36 → 27). Still unchecked: Score History showing `Jdg 36→27` and roster/standings points paying on the scaled value in a real league.
- **Team Dance:** the Score a Team Dance sheet is removed. A team-dance night is now marked by its Round Type on the Schedule form, and each couple's dance is entered on its own. Check this covers how team dances are actually entered.

## Spoiler-Free strip: extended past Home — unverified in a browser

`SpoilerFreeStrip` is live on Home (Pattern B + Soft inset: sticky wordmark + avatar, mauve strip with one hairline directly under it; see `docs/design/spoiler-free-strip-placement/` and `docs/design/spoiler-free-strip-styles/`) and replaces the old callout and auto-opening dialog; the curtain's own sticky bar is gone (its `Week N · status` is now the curtain's top chip). Now also mounted on Results (`/this-week`) and the league hub (`/leagues/[id]`, via `LeagueHeader`, shared by both the Picks and Standings tabs since the mark-watched state is account-wide, not tab-specific) — **and it's genuinely sticky there too now**, using the exact same mechanism as Home (`HomeSpoilerChrome`, reused as-is, not a lookalike): when the strip is present it takes over as the sticky wordmark+avatar+strip stack. When the strip isn't present (Spoiler-Free off or caught up), every fan tab pins the same plain `StickyTopBar` (wordmark + avatar); the scroll-reveal `SlimTopBar` and its page-specific switcher/carousel were removed. `HomeSpoilerChrome` gained an `actionSlot` passthrough so the league hub's Recast button still shows up next to the avatar in the sticky-chrome branch.

The state machine itself (ready/posting/watching, `postingWeekNumber`, the "caught up to a released draft with no live night" fallback) is no longer Home-only inline logic — it's `buildSpoilerFreeStripState` (`src/lib/spoiler-free-strip-state.ts`, tested), and Home's own `page.tsx` was refactored to call it too, so all three mounts can't drift apart.

**Also fixed as part of this**: Home's own top-section spacing bug, where content used `pt-4` when the strip (or the separate draft-scores banner) was showing vs. `py-8` otherwise — a genuine pre-existing inconsistency, not something this session introduced, but it's what made Home look different from Results/Picks/Standings when compared side by side. All four fan tabs now use the same `pt-4` under a pinned top bar in every state.

In-context mark buttons retired on the two covered surfaces: `WeeklyResultsView`'s and `PastPicksCard`'s `MarkWeekWatchedButton` calls are gone (replaced with plain text pointing at "the banner above"). **`AllResultsView`** (admin Scores page) and **`RecastCatchUpCard`** (Recast/Waivers) were explicitly left out of this pass — different surfaces, not named in the original ask — so they still have their own in-context buttons.

**Unverified in a browser** — this container has none. Check: the strip actually appears/behaves identically in all three ready/posting/watching states on Results and the league hub, the `-mx-4` full-bleed treatment doesn't clip oddly against each page's own container padding, and that removing the two buttons didn't leave any dead-end copy (e.g. "Mark it as watched from the banner above" reads sensibly given where the strip actually sits on each page).

## Spoiler-Free "watching live" prompt (built, unchecked on a real episode night)

Built from the designer's "SF watching live · override" board: `LiveScoresPrompt` (Home sheet, once per week per device) and the "Watching live · Week N" strip state, derived from the viewer's mark already covering a still-posting week (so opting in through either button looks the same afterward). Home auto-refreshes every 20s while any week is revealing or the West window is open, so the prompt shows up without a reload. Not shipping: per-couple marks, a Follow live toggle, LIVE chips, End-session chrome, the board's "marked watched" toast.

- **Open: multi-night weeks.** The mark is week-level, so watching live on Night 1 also unlocks Night 2's scores and outcomes with no second prompt. Only Season 35's Week 1 (episodes 1+2) is multi-night and it has aired, so this is dormant unless a later week or a future season uses two nights. Game plan when it matters: (1) accept it (opting in live for a week is opting in for the week; nothing to build); (2) key the prompt and Dismiss per episode so Night 2 re-prompts, leaving the week-level mark alone (small; outcomes for Night 2 still unlock with Night 1's mark); (3) track the high-water per episode (`last_watched_episode`), which touches `spoiler_watch_progress`, the cutoff resolver and every reader keyed off week. Recommend (1), or (2) if Night 2 leaks turn out to bother anyone.

## Results / Picks week carousel

Shared slim ← `Week N — {theme}` → control (`EpisodeCarousel` / `formatEpisodeCasualWithTheme`). Not on Home. `?week=` is `competition_weeks.id`. Multi-episode weeks may show a subtle `Night One + Night Two` under the label.

- **Results** (`/this-week`): prev/next are `/this-week?week=` links. Carousel weeks = spoiler-visible completed **weeks** **plus** upcoming/locked for a theme peek. Unwatched completed weeks are omitted so `?week=` cannot leak results. Completed + visible → results; upcoming/locked → theme peek. Default is the latest visible completed week; before premiere, the first peek week. Pending reveal stays `WeeklyResultsView`'s mark-as-watched card. A week is complete only when every assigned TV episode is complete.
- **Picks / Curtain Call**: one card (`CurtainCallCard`), titled **Curtain Call**. Same carousel; hrefs are `/leagues/[id]/picks?week=`. Live/upcoming week → pick form. Completed week → past recap in that same card. Unwatched completed weeks land on the lock card. No second Past picks card.

Out of scope (still): full season schedule dump, a new schedule page, lock-time hint, Home timeline.

## Bottom nav width + sticky desktop

Implemented (PR #18) — fan and admin tab bars stay `fixed` to the viewport bottom on every width (same as phone) and span the `max-w-2xl` content column. Shared wrapper: `BottomNav` / `FanBottomNav` in `src/components/bottom-nav.tsx`. Surfaces: Home (`/today`), Results (`/this-week`), league Picks/Standings (`LeaguePageShell`), admin (`AdminResultsTabs`).

Out of scope (still): redesigning icons/labels.

## View Results / layout polish

### Episode dropdown on the title line

**Superseded by EpisodeCarousel** (PR #17). Fan Results no longer uses `WeekSwitcher` above the theme — the slim ← `Week N — {theme}` → control sits under the Results title (`PageHeader` children on `/this-week`). The original nit (dropdown sitting *above* the episode title; wanted same-line, right-aligned) applied to that WeekSwitcher chrome and is gone. Picks uses the same carousel inside the Curtain Call card.

Admin View Results is accordion-by-week (nested S35 E0x on multi-night weeks) and has no episode dropdown. Admin Enter Results' Week `Select` is form chrome under the card title, not the fan switcher — not parked.

### DND / "—" display (live check still owed)

Code already maps `episode_results.outcome = 'bye'` → badge **DND**, pts **—** on Admin View Results (by week and by couple) and public Results (`/this-week`). Still needs a real published Did Not Dance couple to confirm on those surfaces. Do not invent a fake production row. Raise only when a Did Not Dance actually happens.

## Past picks vs results (Picks)

Implemented on the league **Picks** tab (`/leagues/[id]/picks`), inside the single Curtain Call card (not a second card, not a new tab).

- Episode switcher is the shared slim `EpisodeCarousel` (`/leagues/[id]/picks?week=`). Fan labels: `formatEpisodeCasualWithTheme` (`Week N — {theme}`), not `formatEpisodeLabel`. Card title is **Curtain Call**.
- Per completed week: your elim pick(s) vs actual, top-scorer pick vs highest `dance_scores.total_score` sum across that week's episodes (same helper scoring uses), Curtain Call points from `weekly_manager_scores.prediction_points`.
- Spoiler-Free: outcomes only for weeks in `resolveSpoilerCutoff` / `allowedEpisodeIds`. Unwatched completed weeks are selectable but locked (“Mark as watched to see how you did”) — no results leak.
- v1 is **your** history only. Hidden when Curtain Call is off.

Out of scope (still): league-wide miss-rate board, bottom-two / “almost had it”.
Spectator role: won’t do / no longer needed.

## Recast / roster spoiler hygiene

Implemented — Recast nudge + `/leagues/[id]/waivers` no longer name an eliminated couple or say they are “out” until that week is in `resolveSpoilerCutoff`. Unrevealed open slots get a vague catch-up card (`RecastCatchUpCard`) with Mark as watched. Revealed slots (or Spoiler-Free off) keep full claim UI. Fan roster tags/points use `clampRosterCoupleForWeek`; Pick 'Em / waiver availability use `isSpoilerSafeActive`. Helpers: `src/lib/recast-framing.ts`, existing `spoilerSafeCoupleStatus`.

Out of scope (still): feature-announcement infra; DND live-data invent.

## Draft / auto-draft

**v1 implemented.** Random-only auto-pick among eligible remaining couples. No ADP, rankings, or team-needs. Does **not** auto-start a draft.

Shipped:
- **Timeout on turn** — `leagues.current_turn_started_at` is the server pick clock. Any league member’s client (draft room or the Picks draft-status card) calls `make_auto_draft_pick` when it expires; the RPC re-checks the clock and places one uniform-random eligible couple.
- **Never joined / not participating** — same RPC and same clock. A started draft still moves if the picker isn’t in the room, as long as someone else is on the league page or in the draft room. Missing people do not start the draft.
- **Sit out / autopilot** — `league_members.draft_autopilot` plus a toggle in the draft room. On that manager’s turn the same RPC fires without waiting for the clock.
- **UX** — draft log labels auto-picks `auto · random`. One timeout is one pick; the next manager gets a fresh clock (autopilot chains are delayed ~1s so they don’t blur).
- **Commissioner undo** — `undo_last_auto_pick` deletes the latest auto-pick only while `draft_status = 'in_progress'`.

Apply `supabase/apply-auto-draft.sql` in the Supabase SQL Editor before this ships to production (`schema.sql` is the greenfield source of truth).

**Later niceties** (still not this cut):
- Countdown + nudge before the first auto-pick
- Pause if half the league ghosts
- Seed RNG per league+draft so picks are auditable
- Undo after the draft has completed (roster_slots already seeded)

## Auction draft

**The problem with snake at small rosters.** Snake pairs pick *i* with pick *2N+1−i*, so every manager's pick indices sum to the same number. That is only fair when value falls roughly linearly across the board. Most drafts here happen **after Week 1**, by which point real judges' scores are in and it is obvious which couples are worthless — so the curve is flat at the top (judges compress the good couples into 7-9) and a cliff at the bottom (an eliminated couple is worth ~0 forever). That is concavity, and under it the end seats are the ones forced to absorb a known dud.

How much it bites depends on whether the draft *consumes* the cliff, and `start_draft` sizes rosters off **active** couples, so after one elimination the cast is 11:

| Managers | Roster | Drafted | Undrafted | Result |
|---|---|---|---|---|
| 4 | 2 | 8 | 3 | fair to ~1% |
| 5 | 2 | 10 | 1 | seat 1 ~19% behind seats 2-5 |
| 6 | 1 | 6 | 5 | one round; snake never applies |

At 5 managers the first pick is actively the worst seat: the pick-1 premium over pick 5 is roughly 65 points while the pick-10 penalty against pick 6 is roughly 150. **Those numbers are illustrative, not fitted** — see the prerequisite below.

**Why an auction is the real fix.** Price replaces seat. The known dud clears at 1, the star clears at 60, everyone can bid on everyone, and nobody is forced to take the dud as though it cost the same as a star. It is the only format where "it's obvious who sucks" stops being a problem, because obviousness gets priced in.

**What it would cost** — roughly a second draft feature:
- `auction_lots` (couple, nominator, high bid, winner, `closes_at`) and `auction_bids`, plus per-member budgets and a format flag on `leagues`. RLS differs by variant: live bids are public, blind bids must stay secret until resolution.
- `nominate_couple` / `place_bid` / lot resolution RPCs, and an autopilot equivalent.
- Both new tables into the Realtime publication. Bidding is far chattier than picking — a short clock resetting on every bid rather than one clock per pick.
- A second mode of `draft-room.tsx`: current lot, countdown, bid input, per-manager budget tracker, nomination queue, sold log.

**The real snag is autopilot.** Today an absent manager sets a ranked `draft_queues` list and `draft_autopilot` covers them. An auction needs *proxy max-bids* — a value per couple, not a ranking. Deriving budget from rank is guesswork that would silently lose people auctions they meant to win.

**Blind sealed-bid variant, possibly a better fit.** Managers privately allocate their budget across couples before a deadline; it resolves in one pass. No Realtime bidding, no live attendance, and autopilot becomes the default rather than a special case — which suits a casual audience that doesn't all show up. The catch: the clearing logic is a real assignment problem, and it is less fun than a live auction.

**Prerequisite before spending anything:** fit `scripts/monte-carlo-calibration/run.mjs` to real Season 35 judges' scores and report mean/SD of final manager points by draft slot (roster sizes 2-3, snake vs linear). The gap may be 19% or it may be 4%.

**Already shipped instead** (2026-09-21): `draft_type = 'custom'` lets a commissioner arrange every round by hand, which hand-balances a lopsided board without new money mechanics. **Rejected:** `linear` is far worse under concavity (spread 215 vs snake's 85 at 5 managers); third-round reversal needs 3+ rounds and only moves the gap rather than closing it. **Note scoring defaults cannot fix this** — `judges_score_multiplier` scales the gap along with everything else, and the only lever that genuinely shrinks it is lowering Dance Card's category weight, which fixes the draft lottery by making the roster matter less and does nothing in a Dance-Card-only league.

## Account deletion processing

v1 queue shipped. Super-admins (`profiles.is_super_admin` only — never the propose tier that can draft results) see pending `deletion_requested_at` rows at `/admin/accounts` (email, display name, requested-at, user id) and can **clear a request**. Clearing does not delete the auth user or league history. Dashboard one-off: [supabase/queries/pending-account-deletions.sql](supabase/queries/pending-account-deletions.sql).

Still out of scope: actually deleting `auth.users` / cascading league history. There is no safe automatic wipe — historical scores stay woven into other members' standings.

## Notifications

Currently in-app only (`/notifications`, reusing the same "picks needed" logic as Today) — deliberately scoped that way for v1. Real delivery (email and/or push) is still an open question: no transactional email provider or push setup exists in this project yet. Revisit once there's a clearer sense of what actually needs to reach someone outside the app.

**`rankBadge` leak, done**: `computeLeagueSummary` used to compute a Home-style rank badge from *all* `weekly_manager_scores` (no `resolveSpoilerCutoff`). The Notifications page never rendered it, but the field was still returned — a latent Spoiler-Free leak if anyone re-wired the UI. The unused field, `getRankBadge` import, and the members/scores queries that existed only for it are gone. Home ranking stays in `league-home-summary.ts` and still respects the spoiler cutoff.

The Add to Home Screen / enable-notifications *how-to* is a top-level Settings row (`/settings/add-to-home-screen`), not nested under Notifications and not on Home. It is UX guidance only — no FCM/APNs, no service worker, no subscribe button. iOS vs Android steps are adapted from LA Home Wins, not a first-visit modal.

(Kylie's own note from when this came up, in case it jogs something later: "see LA Home Wins.")

**Notifications-as-dialog, deferred**: when Account Settings became a Sheet with Profile and Account & data converted to nested dialogs (see `scratch/league-settings-relocation-plan.md`), Notifications stayed a plain full page rather than also becoming a nested dialog — it's a scrollable content list (picks-due per league), not a settings form, so cramming it into a dialog wasn't an obvious win. Revisit if it turns out to matter.

## Account-nav follow-up edits

Settings sheet order A shipped: Profile, Spoiler-Free, Notifications, Add to Home Screen, Account & data. Site Admin and Sign out stay below. No further account-nav edits currently queued.

## Scoring calibration follow-ups

- **Draft-complete judges multiplier lock** — shipped (#44). `update_scoring_categories` rejects a different `judges_score_multiplier` once `draft_status = completed`. It is not part of the Season Clock lock, so a late `start_draft` can still write the roster-size calibration. `reset_draft` lifts it.
- **Strong-play ceiling recalibration** — shipped in code (2026-09-28). Weights are shares of a strong-play season ceiling, not Monte Carlo standings spread, and the baked Grand Finale 3/5 cap is gone. New leagues take the defaults. The four live leagues are updated by `supabase/apply-strong-play-ceilings.sql`, which the owner runs in the SQL editor: it keeps each league's module on/off and category weights, writes the new point budgets, and recomputes `weekly_manager_scores`. Toggle auto-redistribute and Reset to Neutral shipped in League Settings after this: a module toggle splits weight evenly across the modules that stay on and does not rewrite point values; Reset to Neutral restores these defaults plus that split. Both stop at the Season Clock lock. The draft-complete judges multiplier lock is unchanged, and Reset leaves that multiplier alone.
- **Dance Card ~25% calibration overshoot** — a finding from the retired variance model. Do not patch those old multipliers; the ceiling solve replaced them.
- **Refit the ceiling parameters against a finished Season 35** — cast size, finale field, and the judge band in `src/lib/strong-play-ceilings.ts`, once results are final. Also fold in multi-dance nights: the model assumes one dance per couple per week, so semi-final/finale nights with two or three dances inflate Dance Card the way a guest judge used to (guest/missing judges are now handled by `scaled_score`). The variance Monte Carlo script is gone. Not blocked on a database token.
- **Equal-EV / neutral fair scoring defaults** — parked. Separate from equal strong-play ceilings, which shipped.

## Draft order editing placement

`draft_type` lives in League Settings' Dance Card card, but the actual order (reorder list + `CustomDraftOrderCard`'s per-round grid) only lives in the draft lobby (`draft-room.tsx`) — two hops for a one-time setup decision. Designed, not built; not urgent since all drafts have run. Design: move order editing (commissioner-only) into `league-modules-form.tsx` next to `draft_type`, keep a **read-only** mirror in the lobby so managers can still build their auto-draft queue, leave queue/autopilot in the lobby. The wrinkle: the lobby effects that guarantee an order exists before `start_draft` can't move wholesale, or nothing forces a commissioner to open Settings first — resolve by moving the membership-reconcile effects into the new Settings component plus a defensive reconcile inside `handleStartDraft`. No SQL needed; `set_draft_order`/`set_custom_draft_order` are already commissioner + `not_started`-gated server-side.

## Standings Score History

Shipped: per-manager Score History that expands in place under each leaderboard row, plus a redesigned Standings tab with a Couples Leaderboard section (see CLAUDE.md). Design pack: `docs/design/standings-score-history/`. Earlier "points breakdown" concepts (rules sheets, expandable rows, weekly ledger) were rejected.

- **Container:** each leaderboard row expands in place into a compact fixed-height (`h-72`) scrolling panel; several can be open at once. Kylie is also sending mockups for a clearer tap affordance on leaderboard rows.

## Scoring display follow-ups

- **Draft-complete screen** ("Draft complete!", roster card with "Not Drafted") has no entry point in the UI; it is only reachable at `/leagues/<id>/draft` for a completed draft. Not manually verified after the Dance Cards `unrostered` prop change. Raise when a draft next completes (next season).

## Home curtain banner follow-ups

Shipped: new state machine, West overlays, relative "Airs", `episodes.duration_minutes`. See CLAUDE.md. Still worth deciding or checking:

- **Multi-night lock wording**: Curtain Call locks per week (first night minus lock hours), so Night 2 reads "Picks open · Picks locked · Airs Night 2" rather than plain "Picks open". Flip it if that reads wrong.
- **Locked-state gap**: the lock transition happens outside the per-minute window when the lock is more than 6 hours before air, so it updates on the daily tick or next page load.
- Couples Leaderboard is a fixed `h-96` scroller; revisit if the cast is small enough that it looks empty.

## Live score reveal during the West feed

Built (per-couple publish and undo, Finish Week, Home and every page reading a revealing week, Spoiler-Free mid-reveal watch and un-mark). How it works is in CLAUDE.md. Still to do:

- **Run `npm run build` once** (not run this session; a dev server held port 3000) before trusting the deployed reveal.
- **Check it on a real episode night**, ideally a low-stakes one: publish couples as they dance on the Pacific feed, watch Home/Standings/Results as a Spoiler-Free-off and a Spoiler-Free-on viewer, undo one, then Finish Week. Nothing has run through a real final publish with couples already posted; the only live checks so far were reveal, undo and the row-preserving filter on an empty future week.
- **Multi-night weeks:** while Night 2 is being revealed, the week's Curtain Call points that Night 1's publish had already computed drop to 0 until Night 2's Finish Week recomputes the week.
- **Standings' pre-season message** still keys off whether any score rows exist for the league, so it can flip once a week has revealed rows even for a viewer who can't see them.
- **Pushes and lock-screen alerts** don't exist yet; if they're ever added they must never fire on a reveal and must respect Spoiler-Free.

## Parked nits

- Dead `'You are not a member of this league'` branch in `set_custom_draft_order` (`supabase/schema.sql`) — unreachable, never cleaned up.
- League Settings' "✓ Settings saved" banner (`league-modules-form.tsx`) doesn't clear when you edit again.
- Guest judges (Schedule): `episodes.guest_judge_name` and its draft-save passthrough are dead and could be dropped; guest names match exactly (a double space makes a second judge); a failed episode save can leave a new archived guest row with no booking.
- `computeCoupleWeeklyPoints` (`src/lib/roster-weekly-points.ts`) is only used by its own test.
- `supabase/queries/prefill-s35-e06-dances.sql` is an uncommitted one-off (already run 2026-10-13); delete it rather than commit it.
- A human click-through of the custom-draft lobby UI was never done. Raise when next season's drafts start.

## Known scoring/data limitations (not bugs, just scoped-out edge cases)

- **Grand Finale late-deadline gap** (Phase B): if a commissioner sets the Grand Finale deadline later than the default (i.e. after some eliminations have already happened), a prediction submitted at that point won't retroactively score the already-resolved couples — only couples resolved *after* submission score. Never comes up with the default deadline (premiere date), since nothing's eliminated yet at that point.
- **Home/Weekly category-breakdown weighting** (Phase C): the "points by category" breakdown sums each manager's raw per-category points across the season, then multiplies by *current* module weights — not the weight that was actually in effect each week. If a commissioner changes a module's weight mid-season, past weeks' breakdown reflects the new weight, not what was live at the time. Matches an existing, already-accepted limitation elsewhere (weight changes were never retroactive to begin with).
