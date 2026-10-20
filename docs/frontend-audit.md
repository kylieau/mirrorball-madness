# Frontend code quality audit — 2026-10-17

A read-only review of the client components, the hooks under `src/lib/use-*`, and the pages, server actions and loaders that feed them. It looked for state bugs, spoiler leaks across the server/client boundary, live-night failure modes, hydration safety and dead code. Nothing in the app was changed. It ran in two passes, a first pass and a gap pass, and both skipped anything `docs/ux-audit.md` already covers. Items that extend a ux-audit finding say so. Every finding below was re-checked by at least one independent verifier, and their corrections are folded into the text.

**How it was checked**
- **First pass, static read:**
  - Read end to end: `results-form.tsx` (all 1471 lines), `draft-room.tsx`, `pick-em-box.tsx`, `grand-finale-box.tsx` and every hook in `src/lib/use-*`.
  - Read the state, handlers and save paths of `league-modules-form.tsx` and `schedule-manager.tsx`.
  - Read the pages, server actions and loaders that feed them: the Picks page, `league-page-data`, `results-page-data`, score history, the league switcher and the this-week actions.
- **First pass, grep sweeps** across all 62 `"use client"` files for:
  - `Date.now`, `new Date`, `toLocale*` and `Math.random` during render;
  - `useState` seeded from props with no re-sync;
  - server actions awaited without `try/finally`;
  - list keys;
  - `revalidatePath` coverage.
- Traced every `createAdminClient` read in a page through to the props of the client component that receives it.
- **First pass, behavior tests:** scratch vitest files using happy-dom (installed only in the scratch folder), the repo's React, and a scratch config that aliases `@/`. They covered:
  - `usePersistedState` when its key changes;
  - the `useAutoDraftPick` autopilot chain, a rejected call, and a control case;
  - `PickEmBox` keeping stale state when the week advances.
  
  A PGlite script checked a delete on a uuid column with a `local-…` id.
- **First pass, read-only Management API `SELECT`s:**
  - `draft_*` table grants;
  - draft row counts per episode;
  - episode `duration_minutes`;
  - `dance_card_calibration`;
  - the `scoring_settings` multiplier default;
  - live leagues' `roster_size` and multiplier.
- **Gap pass, client files read end to end** (the first pass hadn't covered them):
  - `waivers-panel`, `recast-nudge-card`, `grand-finale-late-unlock`, `grand-finale-order-list`;
  - `all-results-view`, `results-screen`;
  - `live-scores-prompt`, `spoiler-free-strip`, `draft-scores-strip`, `mark-week-watched-button`;
  - `draft-queue-card`, `custom-draft-order-card`;
  - `create-join-league-dialogs`, `submit-button`;
  - `native-auth-listener`, `google-sign-in-button`;
  - `account-data-form`, `account-settings-sheet`, `use-spoiler-progress`;
  - part of `league-info-section` and of `league-members-section`;
  - `judges-dance-styles-manager` (the categories card), and the episode sheet's state and handlers in `schedule-manager`;
  - the league switcher's fetch timing, `app/error.tsx` and the root layout.
- **Gap pass, server pages and the libraries behind them:**
  - the Recast (waivers) page and its actions, the top of the League Settings page, and `admin/results`;
  - Notifications plus `league-summary`;
  - Standings plus `couples-leaderboard` and `league-rosters`;
  - the Picks page's Grand Finale scoring, roster weights and Curtain Call recap;
  - the category weighting in `weekly-score-rows`;
  - `capacitor.config.ts` and `next.config`.
  
  It also checked every server action's `revalidatePath`, and read the router action queue in the installed Next 15.5.27 (`app-router-instance.js`).
- **Gap pass, behavior test:** a scratch vitest file outside `src`, with its own config aliasing `@/` and using oxc's automatic JSX, server-renders `AllResultsView` with `react-dom/server`. It confirmed the By Couple row-count leak (FE-1) and the unlocked split week (FE-10). Both tests pass.
- **Gap pass, read-only Management API `SELECT`s:**
  - `episode_results` rows and each couple's last week;
  - episodes per week;
  - `waiver_mode`, claims and waiver slots;
  - `spoiler_free_mode` counts;
  - `scoring_settings` category weights.
- **Live accounts and writes:**
  - First pass: no live writes and no throwaway accounts. Only read-only Management API `SELECT`s were run. Scratch files are only under the session scratchpad's `audit2/frontend`.
  - Gap pass: no live writes and no throwaway accounts. Only read-only Management API `SELECT`s were run. Scratch files are under the scratchpad's `audit3/frontend-gaps`.
  - No file in the repo was touched in either pass apart from this report. There was no build, no dev server, no app write and no test file added under `src/`.

**Limits**
- **No device or browser run.** Because of the no-dev-server rule:
  - FE-22 (Google sign-in hydration mismatch and the dropped `next`) was found by reading code only. There was no iOS WKWebView run.
  - The server-action queue delay in FE-23 was not timed.
  - The RSC payload in FE-2 was not captured on the wire.
- **Not read end to end:**
  - the JSX branches of `league-modules-form`;
  - `judges-dance-styles-manager` beyond the categories card and the judges card's handlers;
  - `pending-account-deletions`, `add-to-home-screen-notice`, `scoring-module-panel` and `other-leagues-picker`;
  - `dance-card-league-list` and `curtain-call-league-list` beyond their spoiler comments.
- **The Recast spoiler findings (FE-11, FE-27) are latent.** No live league has Recast on, so they couldn't be shown with live data. They rest on the code and the schema.
- **Not re-audited:** server-side spoiler gating in RPCs and RLS, apart from the `waiver_claims` and `roster_slots` policies. `docs/security-audit.md` covers that ground.
- **Checked but not reported:**
  - **Co-manager invite code readable by league members.** The settings page comment at L113-116 says any member can read `co_manager_invite_code` through RLS. It wasn't probed here because `join_as_co_manager`'s member guard is backend scope. It is reported as SEC-2 in `docs/security-audit.md`.
  - **Duplicate pending Recast claims.** These are possible because `submit_waiver_claim` has no duplicate-pending guard. Not reported: it is latent, and it is by design for the multi-bid methods.
  - **The Live Scores sheet's `spoilerFree` state is seeded only once.** This is the same pattern as FE-15 and adds nothing new.

Severity:
- **High:** a real user or attacker can break scoring, see spoilers, peer picks or unreleased scores early, write to data they shouldn't, lose data, or take the site down on a live night.
- **Medium:** wrong behavior or real risk on a common path, or a likely live-night failure with a workaround.
- **Low:** hardening, polish, or maintainability with a concrete payoff.

---

## Findings

**FE-1 · Scores › By Couple shows Spoiler-Free viewers when each couple went home, through the number of locked rows** — High
- **Where:** [all-results-view.tsx:500](../src/components/all-results-view.tsx#L500-L511) (the locked placeholder row); also [all-results-view.tsx:451](../src/components/all-results-view.tsx#L451) (the history is built from `episode_results`), [all-results-view.tsx:507](../src/components/all-results-view.tsx#L507), [results/page.tsx:72](../src/app/admin/results/page.tsx#L72) and [results/page.tsx:81](../src/app/admin/results/page.tsx#L81) (rows passed through without filtering).
- **What's wrong:**
  - In the By Couple view, each couple's history is built from its `episode_results` rows.
  - A week the viewer hasn't watched isn't dropped. It renders as a "Week N | 🔒 Locked" row, so the lock hides only the outcome text.
  - A couple has no `episode_results` rows after the week it goes home. The number of locked rows, and the week label on the last one, therefore give away its elimination week.
- **Why it matters:**
  - Take a Spoiler-Free viewer who is at least 2 weeks behind and opens Settings › Scores › By Couple, a page open to every signed-in user.
  - A couple whose rows stop at "Week 2 🔒 Locked", while the others run to Week 5, plainly went home in Week 2.
  - This reveals every elimination from the week after the viewer's last watched week up to the week before the latest one. A viewer only 1 week behind learns nothing, because every couple still in the show also has a locked row for the latest week.
  - Live data has this shape:
    - 9 couples have stopped receiving rows. Conner Leavitt and Sarah Jane Nader stop at week 1, Giada at week 2, Taylor at week 3 and Ciara at week 4.
    - Active couples run through week 5. Guillermo also stops at week 5, but because he went out in the latest week, his elimination is the one this leak can't reveal.
  - The first pass counted 7 live profiles with `spoiler_free_mode = true`. That count wasn't re-verified.
- **Fix:**
  - Hiding the label alone isn't enough. Either drop the rows for weeks outside `allowedWeekIds`, or render one placeholder that looks the same for every couple (e.g. "Later weeks locked").
  - Better still, filter `episodeResults`, `danceScores` and `judgeScores` down to the allowed weeks server-side in `admin/results/page.tsx`, before they reach the client component. That also keeps the outcomes out of the RSC payload, which ships them today. This pairs with FE-2's fix for drafts.
  - The server-side filter must keep exhibition rows (no `week_id`) and draft or unpublished rows, which the current lock check already exempts.
- **Evidence:**
  - Read [all-results-view.tsx:356](../src/components/all-results-view.tsx#L356-L359) and L447-536.
  - A scratch SSR test rendered `AllResultsView` with `view='couple'`, `spoilerFreeMode=true` and empty `allowedWeekIds`, with couple Alpha eliminated in week 2 and Bravo and Charlie running through week 3. It passes: the markup never says "eliminated", but Alpha has 2 "🔒 Locked" rows and Bravo and Charlie have 3.
  - A read-only query joining `episode_results` to episodes, competition weeks and couples for the active season confirmed that each eliminated couple's last row is its elimination week.
  - **3/3 upheld.** One of the three verifiers would rate this Medium: it needs a viewer at least 2 weeks behind, and the path is Settings › Scores rather than a primary fan tab. The verifiers corrected "every elimination except the most recent week's" to the range above, and corrected the couple counts.

**FE-2 · Unreleased draft scores, drafted eliminations and In Jeopardy ticks reach every signed-in user through the Scores and Schedule pages** — Medium
- **Where:** [results/page.tsx:73](../src/app/admin/results/page.tsx#L73); also [schedule/page.tsx:35](../src/app/admin/schedule/page.tsx#L35), [results-page-data.ts:180](../src/lib/results-page-data.ts#L180-L183), [results-screen.tsx:157](../src/components/results-screen.tsx#L157), [schedule-manager.tsx:200](../src/components/schedule-manager.tsx#L200) (prop type; used at [:439](../src/components/schedule-manager.tsx#L439) and [:454](../src/components/schedule-manager.tsx#L454)), [all-results-view.tsx:216](../src/components/all-results-view.tsx#L216).
- **What's wrong:**
  - `loadResultsPageData` uses the service-role client to read every episode's full draft: draft dances with per-judge scores, draft entries with outcome, Judges' Save and bonus, `inJeopardyCoupleIds`, and custom moments.
  - `/admin/results` (Scores, the View tier, open to any signed-in user) passes the whole `draftsByEpisode` to `ResultsScreen`, which is a `"use client"` component. `/admin/schedule`, also open to any signed-in user, passes it to `ScheduleManager` (`"use client"`).
  - React serializes every prop of a client component into the RSC payload, so the full draft reaches the browser whether it is rendered or not.
  - The consumers need only a small part of it:
    - `AllResultsView` reads `hasDraft` and `entries.length` (L216, 259, 373).
    - `ScheduleManager` reads `hasDraft` and the draft dance couple ids.
- **Why it matters:**
  - On a live night, any signed-in user can open the RSC payload of either page (both are linked for everyone in the Settings sheet, [results-nav.tsx:40](../src/components/results-nav.tsx#L40)).
  - From the first autosave they can read unreleased draft judge scores and songs. `draft_couple_releases` is supposed to gate these, and this path skips it.
  - Drafted eliminations and In Jeopardy can exist only once Finish Week opens, after every couple is posted. That is a short window near the end of the East broadcast.
  - A Spoiler-Free viewer's browser receives all of it too, even though the page never shows it.
  - Signup is open with autoconfirm (Auth config: `disable_signup=false`, `mailer_autoconfirm=true`, Google enabled), so the reader can be anyone on the internet, not only league members.
- **Why Medium, not High:**
  - Nothing is rendered; it takes devtools to read it.
  - Drafts hold only what East TV is airing at the time.
  - This isn't a bypass of a hard boundary. Anyone can call `create_league`, become a commissioner and so reach the Propose tier, where Enter Results shows every draft by design ([enter/page.tsx:36](../src/app/admin/results/enter/page.tsx#L36-L42)).
  - Nothing unpublished is exposed today: E7–E12 have 0 draft rows, and the current drafts are correction drafts of published weeks (58 draft dances, 66 draft results, 0 releases) that match the live tables.
  - The first pass also claimed West-lock Curtain Call picks could be gamed. The verifiers dropped that: West-lock leagues already pick after the East elimination airs, by design.
- **Fix:**
  - Build minimal shapes server-side before crossing the client boundary:
    - `{ hasDraft, entryCount }` per episode for `AllResultsView`;
    - `{ hasDraft, draftDanceCoupleIds }` for `ScheduleManager`.
  - Keep the full `DraftState` only on `/admin/results/enter`, which already redirects viewers without Propose access before loading.
  - Both pages render the same as before and the View tier stays, so this doesn't conflict with the "Results entry has three access tiers" decision.
  - Whether "commissioner of any self-created league" should reach Enter Results at all belongs to that settled decision and to the season-wide Draft Scores decision. It is not reported here.
  - **This is the same exposure as SEC-3 in `docs/security-audit.md`**, which rates it High. One fix closes both.
- **Evidence:**
  - Read `results-page-data.ts:180-183` (`loadDraftForEpisode` with the admin client for every episode), `DraftState` at [results-draft.ts:52](../src/lib/results-draft.ts#L52-L61), and `results-screen.tsx` (`"use client"`, takes `draftsByEpisode` at L108 and passes it on at L157).
  - Read-only `information_schema.role_table_grants`: `authenticated` and `anon` have no `SELECT` on `draft_dance_scores`, `draft_episode_results`, `draft_judge_scores`, `draft_episode_in_jeopardy_couples`, `draft_episode_overrides` or `draft_episode_custom_moments`.
  - The live tables (`dance_scores`, `episode_results`, `judge_scores`, In Jeopardy) are readable by everyone through RLS (`using (true)`, [schema.sql:2532](../supabase/schema.sql#L2532-L2545), [:2635](../supabase/schema.sql#L2635-L2638)), so drafts are the only new exposure.
  - **3/3 upheld, rated down from High to Medium** for the reasons above.

**FE-3 · After results go live, the Curtain Call box shows last week's picks as "Picks saved" for the new week** — Medium
- **Where:** [pick-em-box.tsx:115](../src/components/pick-em-box.tsx#L115-L133); also [picks/page.tsx:597](../src/app/leagues/%5Bid%5D/picks/page.tsx#L597) (rendered with no `key`), [league-page-data.ts:87](../src/lib/league-page-data.ts#L87-L97) (`upcomingEpisode`).
- **What's wrong:**
  - `PickEmBox` copies `eliminatedId`, `eliminatedId2`, `topScorerId` and `editing` from props into `useState` once and never re-syncs them.
  - The Picks page renders it at a fixed position in the tree with no `key`.
  - `upcomingEpisode` is the season's live competition week, so it changes when results are published. When a `router.refresh` lands, the same instance gets the new week but keeps the old state. The refresh can come from `RevealAutoRefresh`'s 20s poll or from a strip action.
  - This happens on the default Picks URL, or with `?week=` set to the new live week. With `?week=` set to the old week, that week switches to recap mode and the box unmounts.
  - The same mechanism covers a lock passing while the page is open. The locked view (L333-355) shows whatever is in local state as the viewer's pick, unsaved edits included.
- **Why it matters:**
  - A manager watching Picks on results night sees Week N+1 marked "✓ Picks saved". It shows last week's top scorer and an "Unknown & Unknown" elimination, because the eliminated couple is no longer in `activeCouples`. In fact nothing is saved for N+1.
  - They may skip their picks and lose Curtain Call points.
  - If they tap Edit Picks › Save, last week's couple ids are submitted against the new week.
- **Fix:**
  - `<PickEmBox key={upcomingEpisode.id} …/>`.
  - To cover the lock-in-place case too, also key on the saved prediction ids and `isLocked`, or derive the read-only and locked display from `existingPrediction` rather than local edit state.
- **Evidence:**
  - A scratch happy-dom test rendered `PickEmBox` for week 5 with a saved pick, then re-rendered the same root with week 6, `existingPrediction` null and couple c1 removed from `activeCouples`. It passes:
    - before: "✓Picks saved…Eliminated Alix & Val Top Scorer Bree & Sasha";
    - after: "✓Picks saved…Eliminated Unknown & Unknown Top Scorer Bree & Sasha".
  - **1/1 upheld.** The verifier added the `?week=` precondition. It also noted that [grand-finale-box.tsx:84](../src/components/grand-finale-box.tsx#L84) seeds state the same way. Grand Finale has no week, so it doesn't advance like this; treat it as a lower-impact related case, e.g. a refresh after the deadline or a late unlock.

**FE-4 · Curtain Call's Cancel shows unsaved choices as "Picks saved"** — Medium
- **Where:** [pick-em-box.tsx:291](../src/components/pick-em-box.tsx#L291-L295); also [pick-em-box.tsx:190](../src/components/pick-em-box.tsx#L190) (`hasSavedPick`), [pick-em-box.tsx:299](../src/components/pick-em-box.tsx#L299-L330) (read-only branch), [pick-em-box.tsx:162](../src/components/pick-em-box.tsx#L162-L170) (`fillFrom`).
- **What's wrong:**
  - `hasSavedPick` is computed from the local dropdown state, not from `existingPrediction`.
  - With no saved prediction, choosing any couple makes Cancel appear. Cancel only calls `setEditing(false)` and doesn't restore the saved values. The read-only branch then shows "✓ Picks saved" with the unsaved choices.
  - With an existing pick, editing it and then tapping Cancel shows the edited values as saved.
  - "Use picks from" (`fillFrom`) is a second trigger. It fills the ids from another league and Cancel appears at once, so the copied picks show as "Picks saved" in this league although nothing was saved here.
  - The parent passes no `key`, so a router refresh doesn't reset this state.
- **Why it matters:** a manager can leave believing a pick is saved when nothing was sent, or believing a change was saved when the old pick stands. Either way they lose or misplace Curtain Call points, often right before a lock.
- **Fix:**
  - Drive Cancel's visibility and the "Picks saved" view from the saved prediction, and hide Cancel when nothing is saved.
  - On Cancel, reset the three ids to the saved values and clear `filledFrom`.
  - `existingPrediction` keeps its first value after a successful save until the server refresh brings the new one. So either keep a local "last saved" copy that `handleSubmit` updates on success, or key the component on the saved prediction ids.
- **Evidence:** read `pick-em-box.tsx:115-133`, 190 and 288-306. It wasn't exercised in a DOM test, because simulating Base UI `Select` wasn't attempted, but the logic is direct. **1/1 upheld.** The verifier added the `fillFrom` trigger.

**FE-5 · Back-to-back autopilot managers each wait out the full pick clock, because the auto-pick effect doesn't re-run** — Medium
- **Where:** [use-auto-draft-pick.ts:48](../src/lib/use-auto-draft-pick.ts#L48); also [draft-room.tsx:317](../src/components/draft-room.tsx#L317), [draft-status-card.tsx:51](../src/components/draft-status-card.tsx#L51), [schema.sql:2062](../supabase/schema.sql#L2062-L2161) (`make_auto_draft_pick`, one pick per call).
- **What's wrong:**
  - The effect's deps are `[leagueId, draftStatus, clockExpired, onTheClockAutopilot]`.
  - Suppose an autopilot pick lands and the next manager is also on autopilot. None of the deps change: the turn clock resets, so `clockExpired` stays false, and `onTheClockAutopilot` stays true. So no new `make_auto_draft_pick` call is made.
  - The chain only resumes when that manager's clock expires. Then `clockExpired` flips and the next pick fires after 1s, and the one after that stalls again.
  - Two refinements from tracing the code:
    - With k draft-room tabs open, each trigger produces up to k picks in a row. Each tab's call queues behind the league row lock and picks for whoever is next.
    - After a stall, `clockExpired` flips true and then false, which re-runs the effect twice. So about two autopilot picks go through per expiry instead of one.
- **Why it matters:**
  - On draft night, sit-out managers who should be auto-picked about a second apart each burn the full `pick_time_limit_seconds` (default 90s) instead.
  - It is worst when many managers are on autopilot, e.g. late in a draft or in a mostly absent league.
  - It contradicts the hook's own "Autopilot chains get a beat" comment.
- **Fix:**
  - Add a dep that changes on every pick, such as `league.current_turn_started_at` or the next pick number. Pass it from `DraftRoom`. `DraftStatusCard` already receives `currentTurnStartedAt`.
  - Handle the `inFlight` ref with care. Today it returns early with no retry, so a dep change during an in-flight call would drop the follow-up pick.
- **Evidence:**
  - A scratch test with a mocked `makeAutoDraftPick` and fake timers rendered the hook with autopilot true and `clockExpired` false; one call fired after 1.1s. The test then resolved that call, re-rendered for the next autopilot manager with the same props and advanced 30s: still 1 call (passes).
  - A control test showed that a deps change (timeout to autopilot) does fire again.
  - **1/1 upheld.** The verifier added the multi-tab and double-run refinements by tracing the code, not by re-running the test.

**FE-6 · The draft card on Picks never updates: the turn goes stale, "Auto-picking…" sticks, and "your turn" never appears** — Medium
- **Where:** [draft-status-card.tsx:44](../src/components/draft-status-card.tsx#L44); also [picks/page.tsx:649](../src/app/leagues/%5Bid%5D/picks/page.tsx#L649-L661), [league-page-shell.tsx:50](../src/components/league-page-shell.tsx#L50).
- **What's wrong:**
  - `DraftStatusCard` on Picks gets `pickCount`, `onTheClockName`, `isMyTurn`, `currentTurnStartedAt` and `onTheClockAutopilot` as server props, computed once at render (`picks/page.tsx:473-491`).
  - It has no realtime subscription and no refresh. `RevealAutoRefresh` only runs on episode nights or during a reveal. Only the 1s clock ticks.
  - Once the server-rendered turn's clock runs out, the card shows "Auto-picking…" for good, and `isMyTurn` never becomes true.
  - It also fires one stale `make_auto_draft_pick` per trigger change. That call is rejected harmlessly ("Not eligible for an auto-pick yet").
  - `makeAutoDraftPick` doesn't call `revalidatePath`, so even a successful pick from the card wouldn't refresh it.
- **Why it matters:**
  - A manager who waits on Picks for their turn (the card says "Join draft room") never sees "It's your turn — pick now". They get auto-picked at random or from their queue.
  - Everyone waiting on that page sees a frozen, wrong draft state.
- **Fix:** subscribe the card to the same `draft_picks` and `leagues` realtime events the draft room uses, or poll with `router.refresh` while `draft_status` is `in_progress`. Otherwise render just a link and drop the live countdown.
- **Evidence:** read `draft-status-card.tsx:36-56` and 92-117 (no subscription), `picks/page.tsx:473-491` and `league-page-shell.tsx:50`. **1/1 upheld.** The verifier clarified that the stale auto-pick fires once per trigger change, not once per tick, and added the missing `revalidatePath`.

**FE-7 · An open, stale League Settings form overwrites the Judges' Score Multiplier that `start_draft` seeded, and marks it customized** — Medium
- **Where:** [league-modules-form.tsx:240](../src/components/league-modules-form.tsx#L240); also [league-modules-form.tsx:483](../src/components/league-modules-form.tsx#L483) (sent on save), [schema.sql:1573](../supabase/schema.sql#L1573-L1592) (customized flag), [schema.sql:1879](../supabase/schema.sql#L1879-L1894) (`start_draft` seeding).
- **What's wrong:**
  - Every field is initialized once from props with `useState`, never re-synced (the file imports only `useState`).
  - `handleSave` sends every field back, `judgesScoreMultiplier` included.
  - Suppose the draft starts while this form stays open in another tab, or a co-commissioner starts it. The next Save or Save & Exit sends the pre-draft value.
  - `update_scoring_categories` accepts that value while `draft_status` is `in_progress`. Because it differs from both the current value and the roster-size calibration, the RPC sets `judges_score_multiplier_customized = true`, so the multiplier is never re-seeded. The draft-complete lock then freezes it.
  - Same-tab navigation back to Settings after starting the draft is safe, because the draft action's `revalidatePath(..., "layout")` clears the router cache ([draft/actions.ts:78](../src/app/leagues/%5Bid%5D/draft/actions.ts#L78)).
  - A stale save after the draft completes errors out rather than corrupting the value. The window is from `start_draft` until the draft completes.
- **Why it matters:**
  - This season's data has exactly that gap. The default seeded at league creation is 0.1421 (roster 3), but every live league drafted at roster size 2, which calibrates to 0.2449.
  - A stale save would silently cut Dance Card judges points by about 42% for the season, and the lock would make it permanent.
- **Fix:**
  - Send the multiplier only when the user changed it.
  - Or send the value the form loaded with, and have the RPC skip or reject the write when the stored value no longer matches it (an optimistic concurrency check).
  - At minimum, refresh before saving and re-sync state from props, e.g. by keying the form on `updated_at`.
- **Evidence:**
  - Read `league-modules-form.tsx:207-331` and 449-521.
  - Read-only SQL:
    - the `scoring_settings.judges_score_multiplier` default is 0.1421;
    - `dance_card_calibration` gives 0.2449 for roster 2 and 0.1421 for roster 3;
    - all 4 completed live leagues are at roster 2 / 0.2449, customized false.
  - **1/1 upheld.** The verifier narrowed the trigger to a form that stays mounted and noted the window ends at draft completion. The draft-complete lock is near `schema.sql:1554`.

**FE-8 · A rejected server action (dropped connection, redeploy) leaves buttons stuck pending, and in the draft room it blocks picking** — Medium
- **Where:** [draft-room.tsx:473](../src/components/draft-room.tsx#L473-L485); also:
  - [use-auto-draft-pick.ts:39](../src/lib/use-auto-draft-pick.ts#L39-L44)
  - [use-debounced-save.ts:20](../src/lib/use-debounced-save.ts#L20-L22)
  - [live-scores-prompt.tsx:55](../src/components/live-scores-prompt.tsx#L55-L66)
  - [spoiler-free-strip.tsx:121](../src/components/spoiler-free-strip.tsx#L121-L133)
  - [pick-em-box.tsx:172](../src/components/pick-em-box.tsx#L172-L188)
  - [grand-finale-box.tsx:152](../src/components/grand-finale-box.tsx#L152-L165)
- **What's wrong:**
  - Client handlers do `setPending(true); await action(); setPending(false)` with no `try/finally` or `catch`.
  - Supabase errors already come back as `{ error }`. The rejection comes from Next's client transport: a fetch `TypeError` on a dropped connection, or `UnrecognizedActionError` after a redeploy.
  - Affected handlers:
    - **`handlePick` in the draft room:** `pendingCoupleId` stays set, so every Available Couple button is disabled (L824). The confirm dialog can't close: Cancel and Confirm are disabled (L886-888), and `onOpenChange` ignores a close while pending (L869).
    - **`useAutoDraftPick`:** `inFlight.current` is never reset, so that tab never auto-picks again. Every connected client runs the hook, so the draft keeps auto-picking through any other open tab.
    - **`useDebouncedSave`:** stays on "Saving…" with an unhandled rejection.
    - **`LiveScoresSheet`'s `handleChoice` and `MarkWatchedStrip`'s `handleMark`:** stuck on "Updating…".
    - **`PickEmBox` and `GrandFinaleBox` `handleSubmit`:** stuck on "Saving…".
- **Why it matters:**
  - On draft night, one dropped request leaves a manager unable to pick until they reload, while their clock runs down and they get auto-picked.
  - On live nights, patchy phone signal leaves Stay Updated, Mark Watched or Save Prediction stuck and disabled.
- **Fix:** wrap each `await` in `try/catch/finally`. Reset pending in `finally`, and show one generic error that covers both the network and the redeploy cases. In `useAutoDraftPick`, use `.catch(…).finally(() => { inFlight.current = false })`.
- **Evidence:**
  - Scratch test "a rejected action leaves inFlight stuck": the first `makeAutoDraftPick` rejects, then the clock resets and expires again, and the call count stays at 1 (passes). A control test with a resolved promise fires again (2 calls).
  - The other sites were confirmed by reading code. The verifier traced the rejection sources to `server-action-reducer.js` (L48, 63-70, 275-278).
  - **1/1 upheld.** Not covered by ux-audit A2, which deals only with pending states on the auth forms.

**FE-9 · Point previews on Picks ignore the league's category weight (and the viewer's late factor), and live leagues use weights from 2 to 8** — Medium
- **Where:** [pick-em-box.tsx:203](../src/components/pick-em-box.tsx#L203-L215); also:
  - [grand-finale-order-list.tsx:98](../src/components/grand-finale-order-list.tsx#L98) and [:119](../src/components/grand-finale-order-list.tsx#L119) (`PointsTag`)
  - [picks/page.tsx:190](../src/app/leagues/%5Bid%5D/picks/page.tsx#L190-L200) (Grand Finale scoring object) and [:541](../src/app/leagues/%5Bid%5D/picks/page.tsx#L541)
  - [grand-finale-box.tsx:211](../src/components/grand-finale-box.tsx#L211)
  - [weekly-score-rows.ts:218](../src/lib/weekly-score-rows.ts#L218-L222)
- **What's wrong:**
  - Curtain Call's "Correct elimination: X pts" preview calls `curtainCallPayout` without `eliminations_category_weight`.
  - Grand Finale's "+X pts" and "up to X pts" tags use `grandFinalePredictionPoints` and `grandFinaleBestCasePoints` with a scoring object built without `bonus_picks_category_weight`. The engine applies that weight at [scoring.ts:381](../src/lib/scoring.ts#L381).
  - The viewer's own `late_factor` isn't applied to their own bracket either. It is applied in [weekly-score-rows.ts:143](../src/lib/weekly-score-rows.ts#L143-L182). Peers' late factors do reach League at a Glance (`lateFactorByManager`).
  - The engine multiplies by those weights when it totals points. Meanwhile the Dance Card numbers on the same page are weighted (`picks/page.tsx` L317, L343, L433).
- **Why it matters:**
  - Live leagues use Curtain Call weights of 2 and 3, Grand Finale weights of 2 and 5, and one league uses a Dance Card weight of 8.
  - In the league with a Grand Finale weight of 5, a bracket tag reading "+10.00 pts" actually adds 50 to standings. A Curtain Call preview of "6.00 pts" in a weight-3 league adds 18.
  - The Dance Card lines next to them are already weighted, so the modules can't be compared on that page.
  - CLAUDE.md says the Curtain Call preview goes "through the same helper so it can't drift from what's actually scored". It drifts whenever the weight isn't 1.
- **Fix:** pass the category weight, and for the viewer's own bracket the late factor, into the preview and `PointsTag` math. At minimum, append the "× N Wt" / "× N late" suffix Score History uses when the value isn't 1, so the numbers read as raw module points.
- **Evidence:**
  - Read `pick-em-box.tsx:195-216`, `grand-finale-order-list.tsx:77-131`, `picks/page.tsx:180-200` and 300-347, and `weekly-score-rows.ts:205-238`.
  - A grep for `weight` in `pick-em-box`, `grand-finale-box`, `grand-finale-order-list` and the League at a Glance lists finds nothing.
  - A read-only query of `scoring_settings` returned (Curtain Call, Grand Finale, Dance Card) weights of (2,2,1), (3,5,2), (1,1,8), (1,1,1) and (1,1,1).
  - **1/1 upheld.** The verifier pinned where the engine applies the weight and the late factor.

**FE-10 · Scores › By Week leaves a split week unlocked while its second night is drafting, so Spoiler-Free viewers see night 1's results** — Medium
- **Where:** [all-results-view.tsx:370](../src/components/all-results-view.tsx#L370); also [all-results-view.tsx:350](../src/components/all-results-view.tsx#L350-L353) (`groupStatus`), [all-results-view.tsx:279](../src/components/all-results-view.tsx#L279) (published branch), [all-results-view.tsx:219](../src/components/all-results-view.tsx#L219).
- **What's wrong:**
  - A week is locked only when `spoilerFreeMode && status === 'published'` and the week isn't allowed.
  - `groupStatus` returns `'draft'` if any night in the week has a draft. So a two-night week whose night 1 is published and whose night 2 has a draft row reads `'draft'`, and is never locked.
  - Opening it renders night 1 through `EpisodeResultsBlock`'s published branch: scores, outcomes, In Jeopardy, Judges' Save and bonuses.
  - Night 2 needs a draft row for this to happen. With no draft, night 2 is filtered out as not started, the week reads `'published'`, and it locks correctly.
- **Why it matters:**
  - Between the two nights, and during night 2's live entry, the week isn't completed, so `resolveSpoilerCutoff` doesn't allow it.
  - A Spoiler-Free viewer who hasn't watched night 1 can open Scores › By Week and see night 1's full results.
  - Week 1 of this season (E1 and E2) is the only split week, and every remaining week is a single night. So this is latent until the next split week, probably next season's premiere.
- **Fix:** lock each published `EpisodeResultsBlock` whose week isn't in `allowedWeekIds`, the same way the By Couple view does at L500-504, rather than locking on the group's status.
- **Evidence:**
  - Read L210-232 and L350-445.
  - The scratch SSR test rendered one week with night 1 published (with results) and night 2 unpublished with a draft, `spoilerFreeMode` true and `allowedWeekIds` empty. It passes: the markup has no "Locked", and the trigger shows the couple count and a Draft badge.
  - A read-only query of episodes per week shows week 1 = episodes 1 and 2.
  - **1/1 upheld.** The verifier added the draft-row precondition and the fact that only one split week exists.

**FE-11 · The Recast page lists every manager's claims with no spoiler cutoff (latent: no live league uses Recast)** — Medium
- **Where:** [waivers/page.tsx:205](../src/app/leagues/%5Bid%5D/waivers/page.tsx#L205); also [waivers/page.tsx:120](../src/app/leagues/%5Bid%5D/waivers/page.tsx#L119-L123) (claims read), [waivers/page.tsx:182](../src/app/leagues/%5Bid%5D/waivers/page.tsx#L182) (`rosteredCoupleIds`), [waivers-panel.tsx:201](../src/components/waivers-panel.tsx#L201-L220).
- **What's wrong:**
  - The page reads every `waiver_claims` row in the league (RLS lets any member read them) and passes them unfiltered to `WaiversPanel`, which renders "{manager} → {couple} (slot N)" plus a status.
  - Each claim carries `week_number`, but nothing compares it with the viewer's cutoff. The same page does clamp the viewer's own open slots through `partitionRecastSlots`.
  - Available Couples also drops a couple recast in an unwatched week, because it is built from current `roster_slots`.
- **Why it matters:**
  - A claim exists only because that manager's slot opened, meaning one of their couples was eliminated or withdrew.
  - A Spoiler-Free viewer who is a week behind sees "Bob → X (slot 2)". They know Bob's roster from the Dance Cards, so they learn who went home before watching.
  - CLAUDE.md requires Recast copy to go through the spoiler-safe helpers.
- **Fix:**
  - Filter claims to `week_number <=` the viewer's cutoff week, with a count-only "N recasts after your last watched week" line if needed. `week_number` is the latest fully completed week when the claim was submitted, i.e. the elimination week or later ([schema.sql:3245](../supabase/schema.sql#L3245-L3258)), so this is the right gate.
  - Keep a pending claim visible to its own claimant. They can only submit once their own cutoff reveals the open slot.
  - Compute Available Couples from the roster slots as of the cutoff week (`slotActiveInWeek`). This leak is secondary.
- **Evidence:**
  - Read all of `waivers/page.tsx` and `waivers-panel.tsx`; read [schema.sql:421](../supabase/schema.sql#L421-L432) (`waiver_claims.week_number`), [:3127](../supabase/schema.sql#L3127-L3130) (member SELECT policy) and `submit_waiver_claim` at L3186-3268.
  - Read-only query: all 5 live leagues have `waiver_mode='locked'`, with 0 `waiver_claims` and 0 `source='waiver'` slots. There is no exposure today; it goes live as soon as a commissioner turns Recast on.
  - **1/1 upheld.** The verifier inferred, without tracing inside `resolveSpoilerCutoff`, that viewers with Spoiler-Free off already see everything, so they gain nothing new.

**FE-12 · `usePersistedState` carries the old key's value to a new key, so an East dismiss can suppress the West live-scores prompt** — Low
- **Where:** [use-persisted-state.ts:20](../src/lib/use-persisted-state.ts#L20); also [live-scores-prompt.tsx:176](../src/components/live-scores-prompt.tsx#L176-L179), [curtain-call-league-list.tsx:54](../src/components/curtain-call-league-list.tsx#L54), [dance-card-league-list.tsx:32](../src/components/dance-card-league-list.tsx#L32).
- **What's wrong:** when `key` changes while the component stays mounted:
  1. The read effect finds nothing stored under the new key and leaves the old value in state.
  2. `hydrated` is already true, so the write effect in the same commit saves the old value under the new key.
  
  `LiveScoresPrompt`'s key includes the coast. If the prompt goes from East to West without unmounting, the East dismissal is copied to the West key. That happens when:
  - the tab was hidden through the ET-to-PT gap, because `RevealAutoRefresh` skips hidden tabs ([reveal-auto-refresh.tsx:30](../src/components/reveal-auto-refresh.tsx#L30));
  - or on any night where the East end touches 8pm PT (a `duration_minutes` of 180 or more).
  
  League at a Glance's expanded state for Curtain Call and Dance Card (keys include `weekId`) carries over the same way, and persists into each newly paged week.
- **Why it matters:** CLAUDE.md says a West prompt follows an East dismiss. A viewer who dismissed East and returns to a backgrounded tab in the West window doesn't get the West prompt on that device. The strips' Stay Updated pill (`LiveScoresPill`) is still a way in, which keeps this Low.
- **Fix:**
  - In the hook, on every key change, reset to the stored value or the default (`setValue(raw !== null ? JSON.parse(raw) : defaultValue)`).
  - Skip the write for the render where the key just changed, e.g. by tracking which key the value belongs to.
  - Keying `<LiveScoresPrompt>` by week and coast at its three render sites would also fix the prompt, but not League at a Glance, so fixing the hook is better.
- **Evidence:**
  - Scratch test "carries the old key's value…": it renders with key `…week-6-east`, sets true, then re-renders with `…week-6-west`. The value is still true and `localStorage[…week-6-west] = "true"` (passes).
  - A read-only query shows every S35 episode has `duration_minutes` 120, so today it takes the backgrounded-tab path.
  - **1/1 upheld.**

**FE-13 · Removing a custom moment just after adding it silently fails, and the moment is still published** — Low
- **Where:** [results-form.tsx:695](../src/components/results-form.tsx#L695); also [results-form.tsx:703](../src/components/results-form.tsx#L703-L706), [results-draft.ts:255](../src/lib/results-draft.ts#L255).
- **What's wrong:**
  - `handleAddCustomMoment` appends a local row with id `local-${Date.now()}`.
  - Adding a moment doesn't touch `draft_episode_overrides.updated_at`, so the rehydrate effect doesn't run, and the real uuid never replaces the local id. (Its deps are the episode id, `published_at`, `updatedAt`, `hasDraft` and the released count.)
  - `handleRemoveCustomMoment` removes the row optimistically and sends the local id. `removeDraftCustomMoment` runs `.eq('id', 'local-…')` on a uuid column, which errors, and the result is ignored.
  - Only a moment removed in the same session it was added, before any rehydrate, is affected. After re-selecting the episode or a change in the released count, the real uuids load and removal works.
  - Same root cause: `loadDraftForEpisode` returns an empty draft when there's no `draft_episode_overrides` row. A moment added before any draft save therefore disappears after a reload, but `commit_episode_publication` still publishes it.
- **Why it matters:** an admin who adds a moment by mistake and removes it sees it vanish, but it stays in `draft_episode_custom_moments`. `commit_episode_publication` then installs it into the live `episode_custom_moments`. It reappears the next time the episode is selected.
- **Fix:** have the add action return the inserted row's id (`.select('id').single()`) and swap it in. On remove, check the result and restore the row if it failed.
- **Evidence:** a PGlite script ran `delete … where id = 'local-1760000000000'` on a uuid primary key and got error 22P02 "invalid input syntax for type uuid"; the row count stayed 1. Read `results-draft.ts:239-261` and [actions.ts:90](../src/app/admin/results/actions.ts#L90-L110). **1/1 upheld.** The verifier added the same-session limit and the related reload quirk.

**FE-14 · Score History lines are cached for the life of the page, so they go stale during the 20s live refreshes or after un-marking watched** — Low
- **Where:** [standings-leaderboard.tsx:39](../src/components/standings-leaderboard.tsx#L39).
- **What's wrong:**
  - `toggle()` fetches `getScoreHistory` once per manager and never fetches again once lines exist, even after the row is closed and reopened.
  - `RevealAutoRefresh` and the Mark Watched or un-mark refreshes update `row.totalPoints` and the totals bar from new server props, but the line feed keeps its first fetch.
  - The cached lines include the revealing week and released draft dances ([score-history-data.ts:53](../src/lib/score-history-data.ts#L53-L73), L124-128), so they really do change during the 20s refreshes.
  - Neither refresh path remounts `StandingsLeaderboard`: both are `router.refresh` or `revalidatePath` ([reveal-auto-refresh.tsx:31](../src/components/reveal-auto-refresh.tsx#L31), [watched-through-setting.tsx:32](../src/components/watched-through-setting.tsx#L32), `this-week/actions.ts`).
  - A failed fetch isn't cached, only a successful one.
- **Why it matters:**
  - On a live night, the totals bar and Season Total move while the lines and running totals stay on the old snapshot, so they disagree.
  - If a viewer moves "I last watched" back, an already-loaded history keeps listing the hidden weeks' lines, elimination-pick outcomes included. Those are only lines the viewer has already seen, which keeps this Low.
- **Fix:** key the cache to something that changes with the server data. For example, pass a data version from the page (the latest scored week, or the revealing state) and clear the cached results when it changes. Or refetch on every open.
- **Evidence:** read `standings-leaderboard.tsx:29-41` and [score-history-panel.tsx:35](../src/components/score-history-panel.tsx#L35-L52). The Standings page mounts `RevealAutoRefresh` through `LeaguePageShell` (`league-page-shell.tsx:50`). **1/1 upheld.**

**FE-15 · The Spoiler-Free switch in the Stay Updated sheet keeps its mount-time value after the setting changes in Settings** — Low
- **Where:** [live-scores-prompt.tsx:51](../src/components/live-scores-prompt.tsx#L51); also [live-scores-prompt.tsx:193](../src/components/live-scores-prompt.tsx#L193-L202) (`LiveScoresPill`), [spoiler-free-strip.tsx:151](../src/components/spoiler-free-strip.tsx#L151) and [:244](../src/components/spoiler-free-strip.tsx#L244).
- **What's wrong:**
  - `LiveScoresSheet` does `useState(spoilerFreeMode)` and never re-syncs it.
  - When the sheet is reached through `LiveScoresPill`, from the posting `MarkWatchedStrip` or the `DraftGapStrip`, the sheet stays mounted after Spoiler-Free is changed in the Settings sheet.
  - Opening the strip's Stay Updated sheet afterwards shows the old switch value.
- **Why it matters:** during a live night, after changing Spoiler-Free in Settings, the Stay Updated sheet can show the opposite of the real setting. Tapping the switch realigns it.
- **Fix:** re-seed `spoilerFree` from the prop each time the sheet opens, the way `MarkWatchedStrip`'s `handleOpenChange` re-seeds `through`. Or render the switch from the prop and keep only a pending override.
- **Evidence:** read `live-scores-prompt.tsx:51-78` and 193-202, and `spoiler-free-strip.tsx`. The toggle action calls `revalidatePath('/', 'layout')` and `router.refresh`, so props update but this state doesn't. **1/1 upheld, narrowed.** The original finding also blamed `SpoilerModeToggle` in the Settings sheet. The verifier dropped that half: Base UI's `Dialog.Portal` unmounts when the sheet closes, so the toggle remounts from the fresh prop.

**FE-16 · Undo Last Pick can drop two picks locally if the realtime DELETE arrives before the action returns (unreproduced race)** — Low
- **Where:** [draft-room.tsx:520](../src/components/draft-room.tsx#L520); also [draft-room.tsx:206](../src/components/draft-room.tsx#L199-L211).
- **What's wrong:**
  - On success, `handleUndoLastPick` does `setPicks(prev => prev.slice(0, -1))`.
  - The realtime DELETE handler also removes the deleted pick, by id.
  - If the DELETE event is processed first, the slice then removes a second, valid pick.
- **Why it matters:**
  - Only the commissioner who tapped Undo is affected. The server-side checks in `make_draft_pick` and `make_auto_draft_pick` prevent any wrong write.
  - Their board is one pick short, and the next pick number, on-the-clock manager, `isMyTurn` and the next Undo target (`lastPick`) are all off by one. This lasts until a visibility change or their own pick runs `refreshDraftState`. The RPC still undoes the true last pick server-side.
- **Fix:** replace the slice with `await refreshDraftState()`, as `handlePick` does at L484.
- **Evidence:** read `draft-room.tsx:199-211` and 513-523. The race wasn't reproduced. **1/1 upheld.**

**FE-17 · Remaining hydration-unsafe renders: the clock and `Math.random` in the first render, and absolute dates in the server's time zone** — Low
- **Where:** [draft-room.tsx:304](../src/components/draft-room.tsx#L304); also [draft-status-card.tsx:37](../src/components/draft-status-card.tsx#L37), [draft-room.tsx:360](../src/components/draft-room.tsx#L355-L363), [schedule-manager.tsx:476](../src/components/schedule-manager.tsx#L476), [account-data-form.tsx:121](../src/components/account-data-form.tsx#L121).
- **What's wrong:** the first render (SSR and hydration) computes:
  - **The draft countdown:** `useState(() => Date.now())` in the draft room and the Picks draft card feeds the `${secondsRemaining}s` text (rendered at `draft-room.tsx:772` and `draft-status-card.tsx:106`). It only mismatches while `draft_status` is `in_progress` with a turn start set. With no turn start, the limit is shown, which is deterministic.
  - **The lobby order:** the draft room's `useState` initializer calls `shuffle()` (`Math.random`) when no draft order is saved. The commissioner's lobby order (a not-started, non-custom draft, rendered at L592) then differs between server and client. The mount effect at L381-388 saves the client's order, so the saved and displayed orders agree and nothing is lost.
  - **Schedule dates:** `new Date(e.airs_at).toLocaleDateString()` runs during render.
  - **The deletion request date:** `toLocaleDateString()` on `deletion_requested_at` is server-rendered on `/settings/account` (FE-26). Inside the Settings sheet it sits in a closed dialog, so it isn't server-rendered there.
- **Why it matters:**
  - Each one is a hydration mismatch: React throws away the server HTML for that boundary and re-renders on the client, with a console error.
  - Schedule dates first render in the server's time zone. If that is UTC, an 8pm ET air time (00:00 or 01:00 UTC the next day) shows the next day's date until hydration.
  - This breaks CLAUDE.md's rule that absolute times are formatted after mount.
- **Fix:**
  - Start `now` as null and set it in an effect.
  - Move the shuffle into the mount effect that already saves the order.
  - Format dates with `useFormattedDeadline` or in an after-mount effect.
- **Evidence:** a grep sweep of all 62 client files for `Date.now`, `new Date`, `toLocale*` and `Math.random`, then a check of which of them run in the initial server render. `all-results-view.tsx:322` and `results-form.tsx:1060` were excluded because they render only after expanding a row or a client-side selection. **1/1 upheld.** The verifier added the preconditions above.

**FE-18 · Grand Finale reorder arrows are announced as "Move [object Object] up" (extends ux-audit N3, which is marked fixed)** — Low
- **Where:** [grand-finale-box.tsx:405](../src/components/grand-finale-box.tsx#L405); also [grand-finale-box.tsx:414](../src/components/grand-finale-box.tsx#L414).
- **What's wrong:** ``aria-label={`Move ${nameFor(coupleId)} up`}`` puts `nameFor`'s return value into a template string. That value is a React element (`coupleNameNode`, [couple-name.tsx:14](../src/components/couple-name.tsx#L14-L16)), not a string.
- **Why it matters:** screen readers hear "Move [object Object] up/down" on the core bracket-reorder task. ux-audit N3 is marked fixed, but this part doesn't work.
- **Fix:** build the label from strings, e.g. a `nameTextFor(id)` helper that returns `${celebrity} & ${pro}` from the same `coupleDisplayNames[id] ?? { celebrity_name, pro_name }` fallback that `nameFor` uses.
- **Evidence:** read `grand-finale-box.tsx:106-111`, 405 and 414. The draft-order arrows (`draft-room.tsx:605`) use a string and are fine. **1/1 upheld.**

**FE-19 · The league switcher prefetches on every Picks or Standings mount, but CLAUDE.md and a code comment say it loads when opened** — Low
- **Where:** [league-switcher.tsx:51](../src/components/league-switcher.tsx#L51); also [switcher/actions.ts:10](../src/app/leagues/%5Bid%5D/switcher/actions.ts#L10-L11), [league-header.tsx:82](../src/components/league-header.tsx#L82-L102).
- **What's wrong:**
  - The mount effect calls `getSwitcherSummaries` for multi-league viewers, which runs `loadHomeLeagueData` for every other league. It runs again on every sheet open (L57).
  - The remount happens on Picks and Standings navigation, and also when `LeagueHeader` switches between its draft, spoiler and plain chrome branches.
  - The prefetch is deliberate (commit 7a23800, "Prefetch league-switcher summaries after mount", and the comment at L35-37).
  - CLAUDE.md says the switcher gets these summaries "when it opens", and the comment in `switcher/actions.ts` says they are "read only when the switcher sheet opens".
- **Why it matters:** the docs describe behavior the code no longer has. Each mount also adds a multi-league Home load per viewer, and FE-23 shows it can delay a first write. Nobody has measured whether that load matters on a live night.
- **Fix:** bring CLAUDE.md's league-switcher sentence and the `switcher/actions.ts` comment in line with the code. Moving the load back into `onOpenChange` (keeping the previous rows while it refreshes) only makes sense if real load is measured.
- **Evidence:** read `league-switcher.tsx:30-59` and `switcher/actions.ts:32-52`. **1/1 upheld, reframed.** The verifier found the prefetch is intentional and that the load claim is unmeasured, so the main fix is now the docs sync.

**FE-20 · The draft room refetches on every `league_members` delete in any league** — Low
- **Where:** [draft-room.tsx:256](../src/components/draft-room.tsx#L249-L260).
- **What's wrong:** the DELETE subscription on `league_members` has no filter, because realtime can't filter DELETE events. Every member removal anywhere in the app makes every open draft room run `refreshDraftState` (three queries in parallel).
- **Why it matters:** this is needless load during drafts. It scales with open draft rooms times leaves and removals across the whole app, and a cascading league delete sends one event per member.
- **Fix:**
  - Filtering on `payload.old.user_id` won't work. `league_members` has a single-column primary key (`id`, [schema.sql:131](../supabase/schema.sql#L131)), and with RLS on, a realtime DELETE payload carries only primary-key columns, even with replica identity full.
  - Instead, add `id` to the `league_members` select in `refreshDraftState` (L154; it isn't selected today), keep it in members state, and ignore any DELETE whose `payload.old.id` isn't a local member id.
  - Alternatively, debounce the refetch, which also collapses the burst from a cascading delete.
- **Evidence:** read `draft-room.tsx:249-260`. **1/1 upheld, fix corrected** by the verifier.

**FE-21 · Dead manager-scores branch in `WeeklyResultsView`** — Low
- **Where:** [weekly-results-view.tsx:226](../src/components/weekly-results-view.tsx#L226-L250); also [this-week/page.tsx:307](../src/app/this-week/page.tsx#L307).
- **What's wrong:**
  - The only caller never passes `nameByManager`, `scoresByEpisode` or `currentUserId`, so the "Points by Team" section is unreachable.
  - Its `isYou` check (L234) compares raw ids, which would mislabel a co-manager if the section were revived. Nothing renders it today, so there is no live co-manager bug.
- **Why it matters:** CLAUDE.md's no-dead-code rule, and a latent co-manager identity bug waiting in the dead code.
- **Fix:** delete:
  - the section at L226-250;
  - the `ManagerWeekScore` type (L32);
  - the three destructured props (L42-44) and their prop types (L61-63);
  - the first two sentences of the comment at L57-60 (keep the `leaguesByCouple` sentence);
  - the `managerScores` computation (L155);
  - the `formatSignedPoints` import, if nothing else in the file uses it.
- **Evidence:** a grep finds no `managerScores`, `nameByManager` or `currentUserId` passed from `src/app/this-week/page.tsx`, and no other caller. **1/1 upheld.** The verifier corrected the start line from 225 to 226 and listed the full cleanup.

**FE-22 · Native (iOS) Google sign-in: a hydration mismatch on the login pages, the invite `next` is dropped, and failures are silent** — Low
- **Where:** [google-sign-in-button.tsx:31](../src/components/google-sign-in-button.tsx#L31); also [google-sign-in-button.tsx:15](../src/components/google-sign-in-button.tsx#L15), [:20](../src/components/google-sign-in-button.tsx#L20), [native-auth-listener.tsx:37](../src/components/native-auth-listener.tsx#L37), [join/[code]/page.tsx:80](../src/app/join/%5Bcode%5D/page.tsx#L80), [join/co-manager/[code]/page.tsx:67](../src/app/join/co-manager/%5Bcode%5D/page.tsx#L67).
- **What's wrong:**
  - `GoogleSignInButton` branches on `Capacitor.isNativePlatform()` during render. `capacitor.config.ts` loads the deployed Vercel URL (`server.url`), so the page is server-rendered with the web branch (a `<form action={signInWithGoogle}>`). The WKWebView then hydrates it with the native branch (a bare `<Button onClick>`), and the element trees differ.
  - The native branch ignores the `next` prop. `redirectTo` is the fixed `NATIVE_AUTH_CALLBACK_URL`, and `NativeAuthListener` always lands on `getDefaultLandingPath()` (`/`). The web flow does carry `next` ([auth/actions.ts:52](../src/app/auth/actions.ts#L52-L72)).
  - `if (error || !data.url) return;` gives no feedback and no pending state.
- **Why it matters:**
  - The mismatch recovers: React client-renders and the native button then works. So it is a console error and a re-render, not a broken page.
  - Only a tap before hydration submits the server-rendered web form. That starts web OAuth inside the embedded WebView, which Google blocks; that block is why the native path exists.
  - The dropped `next` is mostly out of reach today. The iOS app has no universal links or associated domains, so invite links open in Safari, where the web flow keeps `next`. It bites only someone who goes to `/join/CODE` or a co-manager invite page inside the app and signs in with Google. They land on Home and lose the invite.
  - A failed `signInWithOAuth` leaves a button that does nothing.
- **Fix:**
  - Decide native vs web after mount (`useEffect`, or `useSyncExternalStore` with a server snapshot of false), or render the same element in both cases and branch in the click handler.
  - Carry `next` through the native flow, e.g. in the callback URL's query, and have `NativeAuthListener` navigate to `safeRelativePath(next)` instead of `/`.
  - Show pending and error states.
- **Evidence:** read `google-sign-in-button.tsx`, `native-auth-listener.tsx`, `capacitor.config.ts`, `src/lib/native-auth.ts` and `default-landing.ts` in full, plus `login/page.tsx:13-21` and `join/[code]/page.tsx` L15 and L80 (both pass `next`). No device run. **1/1 upheld, rated down from Medium to Low** after the verifier narrowed the impact as above and added the co-manager invite page.

**FE-23 · Read actions fired on mount (switcher summaries, spoiler progress) sit in Next's single action queue ahead of the viewer's first Save (extends FE-19)** — Low
- **Where:** [use-spoiler-progress.ts:16](../src/lib/use-spoiler-progress.ts#L15-L17); also [account-settings-sheet.tsx:65](../src/components/account-settings-sheet.tsx#L65), [league-switcher.tsx:51](../src/components/league-switcher.tsx#L51), [league-header.tsx:90](../src/components/league-header.tsx#L90), and `node_modules/next/dist/client/components/app-router-instance.js:122`.
- **What's wrong:**
  - Next 15.5's router runs server actions and refreshes one at a time. `app-router-instance.js` L122-155 queues any non-navigation action behind the pending one, and only navigations jump the queue. Each action holds the queue for its whole fetch round trip (`server-action-reducer.js` L154).
  - Every TopBar mount for a Spoiler-Free viewer fires `getSpoilerProgress`, through `useSpoilerProgress` in `AccountSettingsSheet`.
  - A multi-league viewer on Picks or Standings also fires `getSwitcherSummaries`, which runs Home's per-league loader (FE-19). The switcher refetches on every sheet open, too.
  - `HomeSpoilerChrome` is keyed by strip kind and week. So when a live-night refresh changes the strip, the TopBar remounts and fires `getSpoilerProgress` again. This only affects Spoiler-Free viewers, because the hook is gated on `spoilerFreeMode`.
- **Why it matters:**
  - On a live night, a viewer who opens Picks and quickly taps Save on Curtain Call, or Stay Updated, has that write queued behind one or two read actions. `RevealAutoRefresh`'s `router.refresh` queues behind them too.
  - The extra delay falls in the minutes before the pick lock, when the RPC compares against `now()`.
  - It only matters for a tap within a second or two of the page painting that lands right at the lock boundary, which keeps this Low.
- **Fix:** fetch these after the first interaction or when the sheet opens. Or move them out of server actions into a route handler or plain `fetch`, so they don't take up the router's action queue.
- **Evidence:** read `app-router-instance.js` L40-160 in the installed next@15.5.27 (`runAction`/`dispatchAction` queueing; only `ACTION_NAVIGATE` and `ACTION_RESTORE` bypass it), plus `use-spoiler-progress.ts`, `account-settings-sheet.tsx:48-70`, `league-switcher.tsx:30-55` and `league-header.tsx:84-100`. The delay wasn't timed. **1/1 upheld.**

**FE-24 · The Grand Finale windowed list centers on the next-elimination row only when it mounts** — Low
- **Where:** [grand-finale-order-list.tsx:254](../src/components/grand-finale-order-list.tsx#L249-L254); also [grand-finale-box.tsx:207](../src/components/grand-finale-box.tsx#L207), [grand-finale-league-list.tsx:68](../src/components/grand-finale-league-list.tsx#L68).
- **What's wrong:**
  - The effect that scrolls the short window (`max-h-40` / `max-h-52`) to `[data-next-elim]` depends only on `[windowed]`.
  - The windowed list only appears in locked views: the collapsed locked summary in `GrandFinaleBox`, and the post-lock League at a Glance list. The order is fixed in both.
  - What changes is the `couples` prop. It changes on a `router.refresh` after Mark Watched or the strip's catch-up, or on the 20s live refresh after a publish. That moves `highlightId` while the list stays mounted, and the list never re-centers.
  - In the League at a Glance accordion, only an item that stays open across a refresh is affected; closing and reopening it remounts the panel.
- **Why it matters:** the gold "Next Predicted Elimination" frame can end up outside the visible window of the compact peek, which is the whole point of that view. The viewer sees an arbitrary slice of their bracket until the page remounts.
- **Fix:** add `highlightId` to the effect's deps.
- **Evidence:** read `grand-finale-order-list.tsx:210-297`. **1/1 upheld.** The verifier corrected the trigger: the original "the order changes in the preview" can't happen, because the pre-lock "Order So Far" preview isn't windowed.

**FE-25 · Custom draft order rows use position-based keys on a reorderable list, and their arrows don't name the manager** — Low
- **Where:** [custom-draft-order-card.tsx:56](../src/components/custom-draft-order-card.tsx#L56); also [custom-draft-order-card.tsx:68](../src/components/custom-draft-order-card.tsx#L68) and [:79](../src/components/custom-draft-order-card.tsx#L79) (aria-labels).
- **What's wrong:**
  - Rows are keyed `${roundIndex}-${indexInRound}`, although ↑/↓ reorders managers within a round. `draft-room.tsx:594` keys its order by `userId`.
  - The arrows' aria-labels are just "Move up/down in round N", with no manager name. `draft-room.tsx:605` and 614 include it.
- **Why it matters:**
  - A screen reader never says which manager the arrow belongs to.
  - Keyboard focus doesn't follow the manager being moved. With position keys it stays on the slot, which now holds a different manager.
- **Fix:**
  - Use `key={`${roundIndex}-${userId}`}`.
  - The stable key alone isn't enough for ↓. React moves the focused node with `insertBefore`, and most browsers blur a moved node, so focus drops to `body`. Refocus the moved manager's button after `onChange`.
  - Put the manager's name in both aria-labels.
  - Edge case: the RPCs only check per-manager totals, not that each round is a permutation ([schema.sql:1755](../supabase/schema.sql#L1755-L1790), [draft.ts:159](../src/lib/draft.ts#L159-L174)). A sequence written straight through the RPC with a manager twice in one round would give duplicate keys. Only a commissioner could do that, and the only effect is React's duplicate-key warning.
- **Evidence:** read all of `custom-draft-order-card.tsx` (L47-91). **1/1 upheld.** The verifier corrected the focus behavior (it drops to `body` on ↓; it doesn't bounce between two managers) and added the aria-label gap.

**FE-26 · `/settings/account` server-renders a locale-formatted date (overlaps FE-17)** — Low
- **Where:** [account-data-form.tsx:121](../src/components/account-data-form.tsx#L121); also [settings/account/page.tsx:40](../src/app/settings/account/page.tsx#L40).
- **What's wrong:**
  - `DangerZone` renders `new Date(deletionRequestedAt).toLocaleDateString()` during render.
  - On the `/settings/account` fallback page, `AccountDataForm` is server-rendered, unlike in the Settings sheet's dialog, which mounts on open. So the server's locale and time zone produce the first text.
- **Why it matters:**
  - A viewer with a non-en-US locale (e.g. en-GB), or one on the other side of midnight from the server, gets a hydration text mismatch on every visit to that page while a deletion request is pending.
  - That breaks CLAUDE.md's date/time hydration rule. It also contradicts ux-audit's "every viewer-local time is formatted after mount".
  - The route is a deep-link fallback. The main path (`AccountSettingsSheet`) is unaffected, so this is rarer than it sounds.
- **Fix:** format after mount, the `RequestedAt` pattern in `pending-account-deletions.tsx`, or use a fixed-locale UTC date. This is the same line FE-17 lists, so fix them together.
- **Evidence:** read `account-data-form.tsx:100-160` and `settings/account/page.tsx:20-45`. **1/1 upheld.**

---

## Conflicts with settled decisions

This finding touches a settled decision. It is for Kylie to decide; nothing should be built unless asked.

**FE-27 · The Couples Leaderboard takes the owner from the newest roster slot, so it reveals a recast made in a week the viewer hasn't watched (latent)** — Low
- **Settled decision:** Couples Leaderboard, "Owner is the couple's current (else last) holder".
- **Where:** [couples-leaderboard.ts:108](../src/lib/couples-leaderboard.ts#L108); also [couples-leaderboard.ts:55](../src/lib/couples-leaderboard.ts#L47-L56), [standings/page.tsx:199](../src/app/leagues/%5Bid%5D/standings/page.tsx#L199), [league-page-data.ts:248](../src/lib/league-page-data.ts#L248) (`leagueSlotPeriods`, not clamped).
- **What's wrong:**
  - `buildCouplesLeaderboard` picks the holder from every `roster_slot` period, preferring `endWeek` null, and reports it as `ownerId`.
  - The Standings page passes the slot periods unclamped, while weeks and couples are spoiler-clamped.
  - A recast slot starts the week after the claim (`finalize_waiver_claim`, [schema.sql:3155](../supabase/schema.sql#L3155-L3156)). So a couple recast after a behind viewer's cutoff shows its new owner instead of "Undrafted".
  - Its judges points also drop to 0, because weeks before `slot.startWeek` are skipped (L71-75).
- **Why it matters:** a Spoiler-Free viewer who is behind sees a couple that was "Undrafted" now owned by Bob, with 0 points. That shows Bob filled a slot, so one of his couples went out in a week the viewer hasn't watched. It is latent today: no live league uses Recast.
- **Fix, if wanted:** clamp at the call site (`standings/page.tsx:199`), or inside `buildCouplesLeaderboard` while keeping it pure:
  - drop slots whose `startWeek` is after the viewer's cutoff week;
  - treat an `endWeek` at or after the cutoff as still open.
  
  The cutoff week is the latest week in `visibleDanceWeeks`, including an opted-in revealing or draft week. The Picks League at a Glance list already clamps this way ([picks/page.tsx:409](../src/app/leagues/%5Bid%5D/picks/page.tsx#L409-L411), `slotActiveInWeek`). The settled rule would then read "current holder as of the viewer's cutoff".
- **Evidence:** read `couples-leaderboard.ts:30-115` and `standings/page.tsx:165-212`. The read-only query from FE-11 found 0 recasts live. **1/1 upheld.** The verifier confirmed the settled-decision label.

---

## Checked and held up

- **Data-returning server actions are scoped server-side.** `getScoreHistory`, `getSwitcherSummaries` and `getSpoilerProgress` work out the spoiler cutoff, revealing week and draft unlock on the server. They take league ids from memberships or check membership, and they use the viewer's RLS client.
- **Admin gates run before service-role reads.**
  - `/admin/results/enter` redirects viewers without Propose access before `loadResultsPageData` runs.
  - `SuperAdminManagers` and `/admin/accounts` check super admin before any service-role read.
- **`RevealAutoRefresh`** clears its interval while a refresh is pending, checks page visibility, and reads its windows through a ref, so there is no stale closure and no leak.
- **`DraftRoom` cleans up.** It removes its realtime channel and visibility listener on unmount, `refreshDraftState` is stable per league, and presence is only advisory.
- **Timers are cleared.**
  - `EpisodeBanner`'s timer is cleared and capped at 24h, so `setTimeout` can't overflow.
  - `useRelativeTimeAgo` and the Enter Results undo ticker clear their intervals.
- **Enter Results autosave avoids stale closures and double submits.**
  - It goes through `flushDraftRef` and `DraftSaveQueue`.
  - Per-couple controls and Finish Week are disabled while their own requests are pending.
  - The rehydrate effect's guard against re-triggering itself holds for the save › revalidate path. FE-13 covers custom moments, which don't trigger it.
- **Carousels are safe.**
  - The Picks and roster carousels are real links, and fall back safely on an invalid `?week=` or `?rosterWeek=`.
  - A recap of a week the viewer hasn't watched stays locked via `allowedEpisodeIds`.
- **Refreshes after writes are covered.**
  - The prediction, Grand Finale and Recast-claim actions revalidate `/leagues/{id}` with `"layout"`.
  - The mark-watched actions revalidate `/` with `"layout"`, and the strips call `router.refresh`.
- **List keys:** reorderable lists use stable ids as keys: bracket order, the draft room's draft order, the queue, rosters and leaderboards. The custom draft order card is the exception (FE-25).
- **Viewer-local times wait for mount** in `useFormattedDeadline`, `useBrowserTimeZone`, `RequestedAt` and the `EpisodeBanner` labels. The absolute dates in `all-results-view` and `results-form` render only after a client interaction. FE-17 and FE-26 list the exceptions.
- **Forms re-sync where it matters.**
  - `WatchedThroughSetting` is keyed by `watchedThroughWeek`, so it re-syncs.
  - `ProfileForm` and `AccountDataForm` re-sync because their Settings sheet dialogs remount on open. The `/settings/account` fallback server-renders `AccountDataForm` instead (FE-26).
- **Co-managers see their own team.** `StandingsLeaderboard` and the draft room compare against `myTeamId` or `findOwnMembership`.
- **`ScrollFade`'s** effect, which measures on every render, bails out when nothing changed, so there is no render loop.
- **Error pages:** only the root `error.tsx` exists. `RootLayout` has no awaits that can throw, so no `global-error.tsx` is needed, and page loaders don't throw on Supabase errors.
- **The browser Supabase client is used only in `draft-room`, `native-auth-listener` and `google-sign-in-button`.** No fan page fetches spoiler-gated rows from the browser.
- **`LiveScoresPrompt`:**
  - The dismiss key is per week and coast.
  - Stay and Mark call `onOpenChange(false)` and then `router.refresh`.
  - The hooks run before any early return.
- **`MarkWatchedStrip`** resets `through` whenever the sheet opens, disables its Mark buttons while pending, and refreshes after marking.
- **`GrandFinaleLateUnlock`** calls every hook before its early return. Edit % pre-fills the stored percent, and Close and Allow are disabled while pending.
- **`RecastNudgeCard`** disables every Claim while one is pending. A first-come-first-served claim revalidates the league layout, so the card disappears.
- **`DanceStylesCard`** re-syncs its optimistic categories from props in an effect, and rolls back on error.
- **`SubmitButton`** (`useFormStatus`) blocks a double submit on Create and Join League.
- **`ResultsScreen`** switches tabs with `history.replaceState`, so there's no server refetch and the URL stays the source of truth.
- **`ScheduleManager`** works out its default air date after mount, and `resetForm` reads fresh props on each Add.
- **`admin/results` naming:** it passes week ids (the output of `groupEpisodesByWeek`) as `allowedWeekIds`, so the naming mismatch is harmless.
- **Notifications and `league-summary`** run server-side and read only the viewer's own predictions.

## Dropped in verification

- **Recast process, approve and reject don't revalidate the league layout**, [waivers/actions.ts:30](../src/app/leagues/%5Bid%5D/waivers/actions.ts#L30) (also L41, L52). The citation is accurate, but the stale Picks or Standings it predicts doesn't happen:
  - Once a server action revalidates any path, Next 15.5.27 builds a fresh client cache and wipes the prefetch cache, whichever path was passed.
  - The pages are dynamic, with no `unstable_cache` or `"use cache"`, so nothing is cached on the server.
  - The only callers are on the `/waivers` page these actions do revalidate.
  
  What's left is a style mismatch with the CLAUDE.md convention, with no visible effect.
