# Session Handoff — 2026-11-10 PT (Lifeline / Recast / Trades released; Lifeline, Recast and Trades open from Picks)

## 1. Current State

Lifeline, the Equalizer, Recast v2 and Trades are on `main` and deployed (Vercel Production; the latest, `86c5aed`, confirmed deployed). The working tree holds only other sessions' files. Kylie applied the three SQL files and scheduled the cron job, then said to commit and push, all on Tue Nov 10 PT during E10's East feed (dates written 2026-11-11 below are UTC). **Live state, read 6:40 PM PT Nov 10:** the three West-lock leagues have Lifeline (from Week 9, Equalizers confirmed, 15 adjustment rows), Recast and Trades on; the two East-lock leagues have all three off. Two Lifeline picks and one waiver claim are saved, no trade offers. E10 is unpublished.

**Roster Moves card (Kylie picked A from `docs/design/roster-moves-card/`, then said to address the reviews and push, Nov 10 PT):** Lifeline, Recast and Trades moved off Your Fantasy Roster into their own Roster Moves card under it, since their lines are about the weeks to come while the roster card can be paged back. The title has no week; each block is labeled (`Week 9 Lifeline`, `Waiver Claims`) and ends in one status line (`Saved · Locks today 8 PM PT.`, `1 saved · Next run Thursday 5 PM PT. Winning claims start scoring in Week 10.`). The UX review's items were all done: plainer start-week copy, the locked duplicate merged (`None saved · Locked.`), labels in every state, default-size buttons, Title Case "You May Have an Open Spot", lower-case today/tomorrow on this card only (`inSentence`; `formatAirsAt` elsewhere unchanged). Codex found nothing functional. Checked in headless chromium at 360px and 390px on a temporary fixture route (removed). Still open, parked by Kylie earlier: a viewer who is behind sees the Roster Moves card and both catch-up cards.

**Roster Moves icons (Kylie picked the hourglass, `docs/design/roster-moves-icons/`, Nov 10 PT; she passed on the bolder `docs/design/roster-moves-recap/` directions as too dramatic):** a green check on a saved Lifeline, a dashed gold circle on an empty spot or missing pick, an hourglass on each waiver claim with `2 saved, waiting on the run · Thursday 5 PM PT.` Copy and layout otherwise unchanged.

**Dance-off entry (Kylie, Nov 10 PT, during E10's West feed):** an immune couple's bonus is editable on their Not in This Round row (before, only Undo was there although the immunity row said to change it there); a Winner's Bonus heat is entered by picking its winner instead of points and Result per couple. Same saved rows, so posting and Finish Week are unchanged. Workaround given before it shipped: set the Winner's Bonus, or Undo and re-mark Immune with Their Bonus.

**Immunity isn't a dance (Kylie, Nov 10 PT):** the immunity row's card no longer shows a style (it read Freestyle for Harry) or Edit Details, and a couple out of a round can't be put in its heats: Enter Results leaves them out, and `supabase/apply-immune-heat-guard.sql` refuses it in the database. Kylie applied that SQL live on Nov 10 PT (reported successful; read-only check beforehand found no existing violations).

**After E10 published (Nov 10 PT, late):** `--verify` matched on all four S35 leagues. **Lifeline was reset in every league at Kylie's request** ("too last minute to be fair"): all 6 picks, 6 payouts and 15 Equalizer rows deleted and Lifeline turned off in the three leagues that had it; standings checked equal to `weekly_manager_scores` on all 200 rows. A backup of the deleted rows is in the session scratchpad only (league data never goes in the repo). A commissioner can turn Lifeline back on from League Settings (it starts at the next open week, with a fresh Equalizer offer). The Week 9 note above about Ariana's backend pick no longer applies; that pick was deleted with the rest. Kellie & Christian's 0 for Week 9 in #supportSWEKylie was checked and is correct (both couples out, no Lifeline, Curtain Call picks missed, bracket 5 slots off). Also shipped: Scores names special-dance rows (`Dance-Off Immunity: +2`), and Home's activity lists a week's overtakes above its eliminations.

**Waiver run 48 hours after results are posted (Kylie, Nov 10 PT, built, not yet pushed or applied when written):** `supabase/apply-recast-after-results.sql` redefines `recast_next_cycle` (due = the week's last `results_published_at` + 48h, null until every night is posted), `process_due_recasts` (no run without results; the run-anyway-after-a-day fallback is gone) and `recast_runs_overdue` (stuck runs only). Picks, Recast, Trades and `RECAST_RULES` say "48 hours after Week N results are posted" until there is a time. Rehearsed in `recast-v2-db.test.ts` and `trades-db.test.ts`. **Deploy the app first, then apply the SQL**: the old app shows a 1970 date for a null due time. Also: Home collapses any posted week during the West feed, not only weeks with an elimination (`ActivityWeek.resultsIn`).

**Open, Kylie to decide:** Grand Finale distance scoring counts slots (same-week couples share a range), not weeks. A read-only comparison over the paid S35 predictions showed weeks would change 9–12 per league (up to about +21 weighted points for a team in #supportSWEKylie, −8 to +4 in Pen & Paso). Questions put to her: weeks or slots, how semi/Finale places count by week, retroactive or not, and whether commissioners agree first. Nothing changed.

**A manager's Week 9 Lifeline was added on the backend after the 8 PM PT lock (Kylie asked, Nov 10 PT, 8:13 PM):** one `lifeline_picks` row inserted with the service role after the RPC's own checks by hand (dead spot eliminated in Week 4, the couple active and not on that roster, no other pick that week); `picked_by` is Kylie. E10's publish pays it like any other pick.

**Lifeline pays whatever the couple's outcome, and the Equalizer follows (Kylie said yes to both and to the push, Nov 10 PT):** a pick pays half the couple's Dance Card credit even when the couple goes home (that week's credit has no survival step). `lifelineValue` in `src/lib/lifeline.ts` no longer zeroes a pick whose couple didn't survive, and `buildLifelineEqualizer` uses the same value, so a couple that went home counts at half its credit in the week's mean. **The Equalizers the three leagues confirmed rise when E10 is published** (every publish recomputes them). If E10 was published on the old build, republishing Week 9 corrects payouts and Equalizers. Copy: Lifeline card and settings say "even if they go home"; Score History reads `Lifeline: {couple}`; the Recast rules say a run is "48 hours after a week's episode". No SQL change. Checks: `tsc`, `eslint src scripts`, `npm test` (99 files / 985), `npm run build`. The reworded copy strings were not looked at in a browser.

**Lifeline on the Recast / Trades row — pushed Nov 10 PT as `86c5aed` (deploy confirmed), on Kylie's "if these decisions are good and pass codex/UX/UI review, good with me to push":** she picked "its own page" from a mock and "rule now, button after". `RosterMoves` has a Lifeline button (first in the row) to `/leagues/[id]/lifeline` (`page.tsx`, `loading.tsx`); the Lifeline card left Picks, and `LifelineStatusLines` under the buttons confirms the saved Lifeline per empty spot. `loadLifelineWeek` (`src/lib/lifeline-week-data.ts`) feeds both pages. Review fixes made before the push: any viewer who is behind gets the catch-up card on the Lifeline page (Codex: one with no couple this week reached the card and peers' locked picks); couple links from the page carry the page's own `from`, so Close still returns to the Picks weeks; the picker label no longer splits into spaced pieces; long names wrap in the pick and league lines; the no-empty-spot card says the league's Lifelines show after the lock and has no empty body; "No pick" is muted once locked; the catch-up card is titled Catch Up to Play a Lifeline; the page subhead states the half-points rule. Checked in headless chromium at 360px and 390px on a temporary fixture route (removed) with long names: no overflow, no console errors. Not checked against a real league. **Left for Kylie (review notes, not done):** the X close on Lifeline, Recast and Trades is a 20px icon with no 44px touch area (all three alike); a viewer who is behind in a league with Lifeline and Recast on sees two catch-up cards on Picks, each with Mark Watched; the Lifeline page has no "How Lifeline Works" card like its siblings; the same dead spot reads "empty roster spot" for Lifeline and "open spot" for waivers; Recast and Trades couple links still drop the Picks weeks on the way back. She was shown the list and the post-review screenshot and said "i think we are good", so none of these is asked for; don't start one without her say-so.

Checks before the commit (2026-11-11): `npx tsc --noEmit` clean, `npx eslint src scripts` clean, `npm test` 99 files / 985 tests, `rm -rf .next && npm run build` succeeds. (`npm run lint` fails only on `.codex-private/`, another session's directory.)

**Recast and Trades open from Picks now, not the top bar** (Kylie picked mock A, `docs/design/picks-roster-moves/`): `RosterMoves` on Your Fantasy Roster, only the mechanisms that league has on. Checked in headless chromium at 360px and 390px on a temporary fixture route (since removed): both, Recast only, Trades only, neither, and the row on its own; no overflow, no console errors.

**Picks confirms a saved waiver list (Kylie approved the screenshot and said to push, Nov 10 PT):** under the Recast button, `WaiverClaimsStatus` in `roster-moves.tsx` lists the manager's saved claims in rank order, or says none are saved (gold when they have an open spot), plus the next run's time. The Fill Your Open Spot card (`recast-nudge-card.tsx`) is deleted; `RecastCatchUpCard` stays for a viewer who is behind, only while a run is left. Files: `src/components/roster-moves.tsx`, `src/app/leagues/[id]/picks/page.tsx`, the deleted card, `CLAUDE.md`, the plan, this file. Checks: `tsc`, `eslint src scripts`, `npm test` (99 files / 985), `npm run build`, and headless chromium at 360px and 390px on a temporary fixture route (since removed) for six states. Not checked against a real league (three now have Recast on).

The Recast and Trades screens and the settings rows were checked in headless chromium at 360px and 390px with made-up data on a temporary route (since removed), because the SQL isn't live. No horizontal overflow, no console errors. The Lifeline turn-on sheet and Picks card have not been browser-checked.

**Codex reviewed the built code (2026-11-11):** four P1s, no P0 or P2, each reproduced, fixed and covered by a PGlite test (see `BACKLOG.md`). The advisor could not run: the main model, `claude-fable-5-2`, doesn't support it.

**Added after Kylie's 2026-11-11 notes:** trade offers expire after 48 hours or at the Semi-Finals lock (`trade_offers.expires_at`); awarded waiver claims and trades that went through show on Home's Recent Activity (`src/lib/home-transactions.ts`). Not built, by her choice until she has used it: a trade-offer row on Picks, one combined Transactions page.

- **The plan and what was decided while building:** `docs/design/lifeline-recast-trades/plan.md` (As Built, at the end).
- **CLAUDE.md** has a section each for Lifeline and the Equalizer, Recast v2 and Trades.

**E10 `--verify` is still owed.** E10 (Week 9) airs Tue Nov 10 PT and is the first live v3 publish. After it is published:
`NODE_OPTIONS=--experimental-websocket npx tsx --env-file=.env.local scripts/dance-card-v2.ts --verify`
Kylie released this build before E10 was published, so E10 will be the first publish through the new plan (`lifelinePayouts` / `lifelineEqualizers`, empty while no league plays). `--verify` matched on all four leagues right after the Lifeline SQL went in.

Hard dates (PT):
- Tue Nov 10: E10 (Week 9). Three leagues lock Curtain Call and Lifeline at 8 PM (West), two at 5 PM (East). Lifeline can't be turned on once a league's Week 9 lock has passed until E10 is published.
- Wed Nov 11, 5 PM: a trade has to be accepted by now to clear its veto window before the first run.
- Thu Nov 12, 5 PM: first waiver run (Week 9), only for a league with Recast or Trades on before then. Adds and trades start scoring in the Semi-Finals.
- Tue Nov 17, 5 PM / 8 PM by league: Semi-Finals lock (the trade deadline).
- Thu Nov 19, 5 PM: last waiver run; adds and trades start in the Finale.
- Tue Nov 24: the Finale.

## 2. Changes Made

All committed on `main`.

**SQL (applied live by Kylie 2026-11-11, in this order):**
- `supabase/apply-lifeline.sql`
- `supabase/apply-recast-v2.sql` (drops the old Recast RPCs: the old Recast page can't submit a claim until the deploy; no league has Recast on)
- `supabase/apply-trades.sql`
- `supabase/queries/schedule-recast-cron.sql` (`pg_cron` enabled; Kylie's `cron.job` check showed `process-due-recasts`, every 15 minutes, active)

Checked afterward with reads only: every function, table and column from the three files is present, the five old Recast RPCs are gone, `anon` is refused on every new table, the standings view matches `weekly_manager_scores` (175 rows, same total, no Lifeline or transfer points), every new table is empty, and all five leagues have Lifeline, Recast and Trades off. `--verify` matched on the four S35 leagues with the Lifeline SQL in (E10 not published yet).

**Tests:** `src/lib/lifeline-db.test.ts`, `recast-v2-db.test.ts`, `trades-db.test.ts` (PGlite); `lifeline.test.ts`, `lifeline-picks.test.ts`, `recast.test.ts`, `trades.test.ts`, `home-transactions.test.ts`; additions to `home-activity.test.ts`, `score-history.test.ts`, `episode-publication.test.ts`, `draft-scores.test.ts`, `dance-card-v2-readers.test.ts`, `couple-history-link.test.ts`.

**Logic:** `src/lib/lifeline.ts`, `lifeline-picks.ts`, `lifeline-enable.ts`, `lifeline-week-data.ts`, `recast.ts`, `trades.ts`, `weekly-standings.ts`, `home-transactions.ts`; changes in `home-activity.ts`, `episode-publication.ts`, `score-history.ts`, `score-history-data.ts`, `league-page-data.ts`, `league-home-summary.ts`, `draft-scores.ts`, `recast-framing.ts`, `couple-history-link.ts`, `supabase/types.ts` (regenerated from the live project 2026-11-11).

**Routes and actions:** `src/app/leagues/[id]/lifeline/`, `src/app/leagues/[id]/trades/`, `src/app/leagues/[id]/waivers/` (page and actions rewritten), `settings/actions.ts` and `settings/page.tsx`, `picks/page.tsx`, `standings/page.tsx`, `admin/results/enter/page.tsx`, `src/app/(fan)/page.tsx`.

**Components:** new `lifeline-card.tsx`, `lifeline-settings.tsx`, `recast-panel.tsx`, `recast-overdue-notice.tsx`, `trades-panel.tsx`, `trades-settings.tsx`, `roster-moves.tsx`; changed `league-header.tsx`, `league-page-shell.tsx`, `league-modules-form.tsx`, `roster-card.tsx`, `dance-card-league-list.tsx`, `top-bar.tsx`; deleted `waivers-panel.tsx`, `recast-nudge-card.tsx`.

**Docs:** `docs/design/lifeline-recast-trades/plan.md`, `CLAUDE.md`, `BACKLOG.md`, this file.

**Not ours; still uncommitted, leave unstaged:**
- `.devcontainer/devcontainer.json`, `.devcontainer/Dockerfile.codex`, `.devcontainer/devcontainer-lock.json`
- `.agents/`, `AGENTS.md`, `.codex-private/`
- `ios/App/App.xcodeproj/project.pbxproj`
- `supabase/queries/add-*.sql`, `supabase/queries/prefill-*.sql`

## 3. Key Decisions

**Kylie's answers (2026-11-10):** restate everything in v3 terms; Lifeline and the Equalizer take the Dance Card weight once; Lifeline options go through the viewer's spoiler cutoff; build all four now and release together (fallback: Lifeline and the Equalizer alone); the Equalizer is one-time and never automatic, the commissioner confirms it (default yes) after seeing every number and rank change; trades use points as cash, capped at 10% per season; no trades after the Semi-Finals lock; no mocks first, build then send screenshots.

**Storage:** `weekly_manager_scores` is unchanged. Totals are read from the `weekly_manager_standings` view through `loadWeeklyStandings`. Lifeline settles inside the publish transaction (`lifelinePayouts` / `lifelineEqualizers` on the plan, checked by `apply_lifeline_settlement`); no `PLAN_VERSION` bump.

**Decided while building, for Kylie to confirm** (full list in the plan's As Built):
- Each mechanism is its own commissioner switch, default off. Trades is independent of Recast.
- 4th and 5th in the Finale earn judges' points and bonus only; Lifeline's Finale pays half the credit whatever the outcome.
- Recast: claims private until the run; lists don't carry over; turning it on never runs a week already due; the late-run alert is an admin notice on Enter Results.
- Trades: veto = more than half of the teams not in the trade; at least one couple; up to 12 parts; everything moves at the waiver run; an offer expires after 48 hours or at the Semi-Finals lock; accepted trades can't be backed out of; trade points sit under Dance Card.
- Lifeline, Recast and Trades are buttons on Your Fantasy Roster on Picks (Kylie, Nov 10), not in the top bar. Lifeline has its own page; its card is no longer on Picks.
- For a UI placement change Kylie wants a mock or screenshot first, and a Codex and UX/UI review before the push.

**Rules that still hold:**
- No merge, deploy, live SQL apply or live DB write by the build agent. Kylie applies SQL after an explicit OK.
- No turning Recast on in the four live leagues as part of the PR. Kylie enables `pg_cron`.
- The Equalizer preview is announced to the league. If it raises Kylie's rank, the commissioner or the league decides.
- In-app Recast copy says "waiver".
- The repo is public: never commit league standings or member names.
- A push to `main` needs Kylie's yes in that turn. Commit only when asked. Stage by name. Never `pkill -f`. Don't run prettier. `rm -rf .next` before `npm run dev` after a build.

## 4. Next Steps

1. After E10 is published (the first publish on this build): run `--verify`. The rule change is deployed (`14556d4`). The three leagues' Equalizers rise at that publish.
2. Kylie hasn't answered yet: test each transaction in a scratch league (`scripts/qa-screenshots/seed.mjs`; live writes need her yes).
3. Browser-check with throwaway accounts against the live project: Lifeline turn-on sheet and Equalizer numbers, a Lifeline pick, a waiver list, a trade offer through accept and veto.
4. Commissioners opt in: Recast or Trades before Thu Nov 12, 5 PM PT for the first run; everything before the Semi-Finals lock.
5. Kylie's own: run `supabase/apply-dance-card-v3-default.sql` (new leagues start on v3).
6. Later, once Kylie has used trades: a Roster Moves card with what is waiting on you (mock C), or one Transactions page.

Open limits are listed in `BACKLOG.md` (Lifeline, Recast and Trades — 2026-11-11).
