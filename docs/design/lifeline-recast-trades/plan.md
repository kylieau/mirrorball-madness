# Recast, Lifeline, Equalizer and Trades: Build Plan v2

Revised Tue Nov 10, 2026, evening, after review by the advisor and Codex and after Kylie's answers. Replaces the afternoon plan wherever they differ.

**Status:** all four were released to `main` on Tue Nov 10 PT (Nov 11 UTC, the date used below), during E10's East feed, with the SQL applied and the cron job scheduled. Every switch starts off. See As Built at the end for what was decided while building and what changed with the early release.

## What Changed From the Afternoon Plan

- **Dance Card v3 everywhere.** All four live leagues went v2 → v3 at about 1:30 PM PT. Every formula below uses a couple's v3 weekly credit: judges × rate (0.2731 at roster size 2), plus that week's survival step (3.00 × √n total, so step n is 3(√n − √(n−1))), plus any Fantasy Bonus. The engine already produces it per couple per week (`weekCredits`, `src/lib/dance-card-v2.ts`).
- **Dance Card weight applies.** Lifeline and the Equalizer are computed raw, like `roster_points`, and weighted by the league's Dance Card category weight once, into `total_points`.
- **Commissioner opt-in, default off, per mechanism** (Recast, Lifeline, Trades). This replaces "house rule for all four leagues." *Inferred from the Commissioner Opt-In note and the Equalizer answer; correct me if it's wrong.*
- **Trades are in S35**, released with everything else, using points as cash under a cap.
- **One release.** Everything ships together, live before the Semi-Finals lock.

## Hard Dates (PT)

| When | What |
|---|---|
| Tue Nov 10, tonight | E10 publishes. Run `--verify`. No pipeline change before that passes. |
| Sun Nov 15 to Mon Nov 16 | Release target: SQL applied, app deployed. Commissioners opt in, confirm the Equalizer and make Lifeline picks. |
| Tue Nov 17, 5 PM | Semi-Finals. Earliest Lifeline lock (the leagues on an East lock); the others lock at 8 PM. |
| Thu Nov 19, 5 PM | The only Recast run (and trade swaps). Winners and traded couples start in the Finale. |
| Tue Nov 24, 5 PM | Finale. No Recast after it. |

## Shared Storage (Build First)

Lifeline, the Equalizer and trade cash all add points to standings, so they share one design:

- The facts live in their own tables: `lifeline_picks`, `lifeline_payouts`, `league_point_adjustments` (the Equalizer and trade cash, with provenance), and later `trade_offers` / `trade_legs` / `trade_votes`.
- **`weekly_manager_scores` does not change.** Every writer of that table (publication and its later-week rebuild, reveal, recompute, `set_dance_card_points` with its archive) deletes and reinserts rows with explicit column lists, so a new column there would be wiped by the next write. Those writers and `--verify` stay as they are.
- **Standings read a view, `weekly_manager_standings`:** the stored week row plus `lifeline_points` (raw payouts and the raw Equalizer), `transfer_points` (trade cash, already in weighted units) and a `total_points` that adds the weighted Lifeline amounts and transfers to the stored total. Every reader that shows or ranks totals reads the view.
- **Lifeline settles inside the publish transaction.** The plan carries `lifelinePayouts` (one row per pick, for this week and every later scored week) and `lifelineEqualizers` (recomputed amounts). The SQL checks exact coverage and refuses a plan without them while any league plays Lifeline, so no `PLAN_VERSION` bump is needed.
- Release order: the additive SQL first (the current app keeps working while no league has Lifeline on), then the app.
- An adjustment applied outside a publish (the Equalizer at confirm, trade cash at the Thursday run) is written on the **latest published week**. Past points never move. Standings change the moment it's confirmed or processed.

## Lifeline

- **Commissioner turns it on** in League Settings (default off).
- **One pick per dead slot.** A dead slot is one whose current occupant is eliminated or withdrawn and that Recast hasn't refilled.
  - Each week the manager picks a living couple they don't own. Two slots means two different couples.
  - Several managers may pick the same couple, and repeating last week's couple is allowed.
  - From Week 10 on.
- **Payout:** `max(0, 0.50 × that couple's raw v3 weekly credit)`, then the Dance Card weight is applied.
  - **A couple that goes home that week still pays** (Kylie, Nov 10, changed from "only if the couple survives"): its credit has no survival step, so the payout is half its judges' points plus any bonus. The Finale works the same way for a 4th or 5th place couple.
  - A bye pays 0: the couple has no dances and no survival step.
- **Lock** at `prediction_lock_at`, or at `airs_at` when Curtain Call is off. Picks can change until then.
- **Settles** inside the publication writers and recomputes on any re-publish.
- **Spoiler-Free covers the viewer's own card too.** The card, the number of slots and the list of pickable couples all go through the viewer's spoiler cutoff, as Recast does today (`recast-framing.ts`).
  - A viewer who is behind gets a catch-up state instead.
  - If they haven't caught up by the lock, they miss that week's pick.
  - Server-side eligibility stays authoritative.
  - Peers' picks are hidden until the lock, as with Curtain Call, and their payouts until the viewer's cutoff.
- **Score History** shows `Lifeline: <couple>, +X.XX`. The Couples Leaderboard excludes Lifeline.

## Equalizer (One-Time Lifeline Catch-Up)

- **Formula, per dead slot-week:** 0.50 × the mean, over every couple that danced that week, of `max(0, that league's v3 credit)`.
  - A couple eliminated or withdrawn that week counts at its credit like any other, the same as a pick on it pays (Kylie, 2026-11-10). Every publish recomputes a confirmed Equalizer, so the amounts three leagues confirmed under the earlier rule (such a couple counting as 0) rise at the next publish.
  - Then the Dance Card weight is applied.
- **Which weeks count:** from the week after the elimination, through the last published week before Lifeline launches. Only from the Anchor Week (2) on. Stops at a Recast `start_week`. A withdrawal counts the same as an elimination.
- **Never automatic.** Turning Lifeline on opens a confirm sheet, with the Equalizer included by default. The sheet shows:
  - every manager's points
  - the slot-weeks behind them
  - before and after standings, with every rank change named
  - The commissioner can confirm with or without it.
- **Computed by a dry-run path** that writes nothing, which also feeds the confirm sheet.
- **Stored** as one adjustment with its provenance, written onto the latest published week's row at confirm.
  - A later re-publish of an earlier week updates that one adjustment, not earlier totals.
  - Score History shows `Lifeline Equalizer, Weeks 4 to 9: +X.XX`.
- **Previews name members and standings, so they stay out of the public repo.**

## Recast

As locked in the afternoon plan, with these corrections:

- **Commissioner opt-in, default off.** Turning it on writes `waiver_claim_method = 'reverse_standings'` (a constraint requires one). There is no method picker.
- **Winners start in the next competition week that hasn't aired at all, not the next episode.** Ownership changes at week boundaries (`finalize_waiver_claim`). Processing happens once per completed week.
- **The wire and the public log are spoiler-gated**, like today's Recast page. A pending drop of a living couple can be shown.
- **The scheduler is `pg_cron`**, which Kylie enables in the Dashboard early in the week so the job can be tested end to end. It is idempotent per league per week.
- **The single S35 run is Thu Nov 19, 5 PM PT.**
- Copy uses "waiver" ("Recast is Mirrorball's waiver wire").

## Trades (Now in S35)

- **Commissioner opt-in, default off.**
- **Points as cash.**
  - A trade can be uneven (couple plus points for a couple), one-sided (points for a couple) or involve more than two parties.
  - Cash is in weighted `total_points` units, only from points already earned. Across the season, a manager can send at most 10% of their earned total at the time of sending (Kylie, Nov 10).
  - Cash lands as `transfer_points` on the latest published week when the trade executes.
- **Every party accepts**, then a 24-hour league-majority veto covers the whole package.
- **Couple swaps apply at the Recast run**, with the same start week as a Recast award.
- If a couple is in both a pending trade and a pending claim, the first submitted wins.
- If any leg becomes invalid before it executes (for example, a couple is eliminated), the whole trade fails.
- **Deadline: no trades after the Semi-Finals lock** (Kylie kept it, Nov 10). Offers must be accepted before that league's Week 10 lock. The veto runs 24 hours from acceptance. Swaps apply at the Thu Nov 19 run. With a release around Nov 15 or 16, the S35 window is about one to two days.

## Fallback

If Recast or Trades aren't ready around Nov 16, Lifeline and the Equalizer ship alone, so they make the Semi-Finals. Recast and Trades follow before Thu Nov 19 (Kylie, Nov 10).

## Build Order (on a Branch, Nothing Live Until E10 Verifies)

1. Shared storage and engine (tables, the standings view, the settlement inside publish), with PGlite tests.
2. Commissioner toggles in League Settings.
3. Lifeline (picks RPCs, Picks card, settle, Score History).
4. The Equalizer dry run, confirm sheet and stored adjustment.
5. Recast rebuild and `process_due_recasts()`.
6. Trades.
7. One SQL file and one PR. Kylie applies the SQL, then we deploy, then browser-check with throwaway accounts.

Rough effort: 60 to 80 focused hours.

## As Built (Wed Nov 11)

Three SQL files, applied in this order, then the cron job, then the app: `supabase/apply-lifeline.sql`, `supabase/apply-recast-v2.sql`, `supabase/apply-trades.sql`, `supabase/queries/schedule-recast-cron.sql` (needs `pg_cron` enabled). Each is rehearsed in PGlite (`lifeline-db.test.ts`, `recast-v2-db.test.ts`, `trades-db.test.ts`). `apply-recast-v2.sql` drops the old Recast RPCs, so it goes in right before the deploy.

The screens were checked in a headless browser at 360px and 390px with made-up data, because the SQL isn't live. A check with throwaway accounts follows the apply.

### Readings Made While Building (Kylie to Confirm)

**Lifeline**
- 1st to 3rd place earn the Dance Card survival step in the Finale. 4th and 5th are stored as `eliminated`, so they earn judges' points and any bonus only. Lifeline pays half the couple's credit whatever the outcome, in the Finale and every other week.
- Each mechanism is its own commissioner switch, default off.

**Recast**
- Claims are private until the run. Lists don't carry over to the next run.
- A claim on a couple another manager is dropping waits for that drop: it only wins if the drop happens. When it does, the first manager in the order who was waiting gets the couple, ahead of anyone after them.
- Turning Recast on never triggers a run for a week that was already due, and claims can't be saved for one that Trades is keeping alive.
- A viewer who is behind has to catch up before editing a list.
- The alert for a late run is a notice to site admins on Enter Results, not an email.
- A spot emptied by a trade is offered as Open Spot, and counts as an open spot on Picks.

**Trades**
- A veto takes more than half of the teams not in the trade. When every team is in it, there is no veto. A vote from a team that has since left the league doesn't count.
- A trade has to move at least one couple, and holds up to 12 parts.
- A manager who trades a couple away for points has an empty spot. It gets no Lifeline pick, and Recast can fill it.
- A couple in an open trade, including an offer not yet accepted, can't be in a waiver claim, and the reverse. A couple can be in only one accepted trade.
- Everything in a trade, points included, moves at the waiver run. A trade accepted less than 24 hours before a run waits for the next one.
- The 10% cap counts all points a manager has sent, against the points they have earned without transfers.
- An offer expires 48 hours after it is sent, or at the Semi-Finals lock if that comes first (Kylie, 2026-11-11). The proposer can cancel and anyone in it can decline before then.
- An accepted trade can't be backed out of. Failed and vetoed trades show in the league's Trade Log.
- Trade points show under Dance Card in Score History and count in the Dance Card total on Standings.
- Trades is independent of Recast. Turning Trades off cancels open offers and accepted trades that haven't taken effect.

### After the Release (Tue Nov 10 PT)

- **Released a week ahead of the dates above**, so the Hard Dates table and "the single S35 run" no longer hold: a league that turns Recast or Trades on before Thu Nov 12, 5 PM PT gets a run then (Week 9; adds and trades start scoring in the Semi-Finals), and every league with either on gets the Thu Nov 19, 5 PM run (start in the Finale). For the Nov 12 run a trade has to be accepted by Wed Nov 11, 5 PM PT, so its veto window closes first.
- **Lifeline locks with Curtain Call**, so a league whose Week 9 lock hadn't passed could play it for Week 9. Turning it on is refused while an earlier week is unpublished.
- **Recast and Trades open from Picks, not the top bar** (Kylie, Nov 10; mocks in `docs/design/picks-roster-moves/`, option A): a row of buttons on Your Fantasy Roster, only the ones that league has on.
- **Lifeline is a third button on that row and has its own page** (Kylie, Nov 10, picked from a mock): `/leagues/[id]/lifeline` holds the picker that was a card on Picks. Under the buttons Picks confirms the saved Lifeline per empty spot, or says in gold that none is saved, with the lock time. The catch-up card for a viewer who is behind stays on Picks.
- **Picks confirms a saved waiver list** (Kylie, Nov 10): under those buttons, the manager's claims in rank order, or that none are saved (in gold when they have an open spot), and when the next run is. The Fill Your Open Spot card is gone.

### Known Limits

- `saveLifelinePicks` clears then sets, in two calls, so a failure between them can leave a slot without its pick.
- The Equalizer is refused when a manager has no score row on the latest scored week.
- `reset_draft` doesn't clear `recast_cycles`.
- In a two-night week, a couple eliminated on the first night can still show as a drop or wire option until the week is complete.
- A proposed offer holds its couples out of their owner's waiver drops until it is declined, cancelled or expires.
- The waiver order is set before trade points move in the same run.
- With Recast off and Trades on, Trades copy still says "waiver run".
- Not built: a Lifeline line on the Home league card, and Lifeline lines on Standings' roster card.
- Not built: a trade-offer row on Picks, and one combined Transactions page. Awarded claims and trades that went through show on Home's Recent Activity (Kylie, 2026-11-11), in the Recast page's Adds and Drops and in the Trades page's Trade Log.
