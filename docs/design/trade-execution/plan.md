# Trades take effect when their veto window closes

Kylie, 2026-11-12 (Thu evening PT): a trade accepted tonight, after the
Week 9 waiver run, should be able to take effect before the Semi-Finals
air on Tue 2026-11-17, not wait for the Week 10 run on about Thu
2026-11-19 and land in the Finale. Also: the other managers have no way of
knowing a trade is up for veto unless they open the Trades page.
Reviewed by the advisor and Codex before the build; findings folded in.

## What happens today

- A trade executes only inside `run_league_trades`, which only
  `process_league_recast` calls, which only runs when a league's waiver run
  comes due: 48 hours after a week's results are posted. The run executes
  every accepted trade whose `veto_ends_at <= now()`, then decides claims.
- So a trade accepted after a run waits for the next run, a week later, and
  starts scoring in the week after that. In S35 there is one run left
  (Week 10 results + 48h, about Thu 2026-11-19, start week 11), so every
  trade accepted from tonight on is a Finale trade. The trade deadline (the
  Semi-Finals lock, `trade_deadline`) means every accepted trade clears
  before that run; that only holds because of this season's dates.
- `assert_trades_open` (propose and accept) requires a future run with a
  start week, `recast_next_cycle(...).start_week is not null`.
- Offers lapse at `least(expires_at, trade_deadline)`, but the row is only
  marked `expired` by the run; reads treat it as lapsed in the meantime.
- The veto surfaces in one place: the Up for Veto card on
  `/leagues/[id]/trades` (terms, "Veto window closes …", "0 of the 3 veto
  votes it would take", Vote to Veto). Home's league card and the
  Transactions card on Picks list only trades the viewer is in; the Trades
  tab's needs-you dot is an offer waiting on the viewer only. An outside
  manager finds out from the group chat or not at all.

## The change

### 1. Trades execute on their own clock

A new service-only `process_due_trades()` is called at the end of
`process_due_recasts()`, after the due waiver runs (Codex: a trade's
points moving on the same tick before a run reads its order could swap
two claimants' priority; running the due cycles first keeps the run's
"order frozen before any trade's points move" true), so the existing
`pg_cron` job (every 15 minutes) runs it with no job surgery and no
window where the job is missing; one comment notes the job's name now
covers both. For every league with
`trades_enabled`, under the `leagues` row lock the
run takes, it calls `run_league_trades(league, v_start - 1, v_start)` with
`v_start := public.release_effective_week()`: the first week whose first
night hasn't aired, else the week after the last (the rule a removal
uses). Each league in its own sub-block, so one failing doesn't stop the
rest, as in `process_due_recasts`.

**The publish gap (advisor):** `trade_problem`'s `not_dancing` check reads
`couples.status`, which only changes at Finish Week. The run is safe
because it comes 48 hours after results; a window closing between the
East curtain and Finish Week (every S35 week so far was finished after
10 PM PT) would execute on Monday's status and hand the new manager a
couple who went home an hour earlier, breaking "whole or not at all".
So **`run_league_trades` itself holds** (returns 0 without executing,
offers still marked expired) while any aired episode of the active season
that belongs to a competition week is unpublished, and the trades execute
on the first tick after publish; the same pause Grand Finale late submits
take (Settled Decisions). In the shared function, not the new caller, so
a delayed waiver run that comes due during the gap can't execute them
either (Codex); such a run still decides its claims, and the trades
follow after Finish Week with their own start week. Scoped to episodes
with a `week_id` (Codex: an aired exhibition night never gets results
and would hold trades for good). The hold is season-wide, not per league,
since couple status is. A window closing before the curtain is
unaffected.

`run_league_trades` is unchanged in what it does: every accepted trade
with `veto_ends_at <= now()`, in acceptance order, re-checked whole
(`trade_problem(id, true)`), couples closed and reopened on
`roster_slots` from the start week, Lifeline picks for the new spot and
couple dropped from the start week on, points landed on the latest scored
week as two `trade_transfer` adjustments, `status = 'executed'` with
`week_number` and `start_week`; then lapsed offers marked `expired`. Two
additions:

- A start week past the Finale fails the trade with a new `result`
  `no_week_left` (check constraint widened; copy "The season ended before
  the trade could take effect"). Reachable only by a trade accepted inside
  the last 24 hours before the Finale's curtain, which the Semi-Finals
  deadline rules out in a normal schedule.
- `week_number` is the week before the start week, which is what the run
  stamps too (results week 9, start week 10), so Home's Recent Activity
  and the Trade Log keep grouping a trade under the week whose results
  preceded it and a viewer who is behind keeps the same gate
  (`tradeLogVisible`, `homeTransactions`).

`release_effective_week` is not `security definer`; called from inside
one it runs as the definer, so the service-role grant missing from the
live apply doesn't matter here.

`process_league_recast` keeps calling `run_league_trades` first, so a trade
whose window closes in the fifteen minutes before a run still goes before
the claims, and the run's own start week agrees with
`release_effective_week()` at that moment (both are the first week not yet
aired after results + 48h). Nothing else about the run changes.

`assert_trades_open` drops the "no more waiver runs" check for
`release_effective_week() <= finale week` (the week marked Finale, else
the last scheduled week, the same fallback `trade_deadline` uses), with
the message "There is no week left for a trade to take effect in". The
deadline check stays.

The waiver order is read at the top of the run, so a trade's points that
moved on an earlier tick are in it, as any earlier week's points are; a
trade clearing on the run's own tick goes after the run, so it can't
change that run's order.

### 2. Timing, S35

| Last acceptance (PT) | Executes | Couples move for |
|---|---|---|
| Thu 2026-11-12 night | 24h later, within 15 min | Week 10, Semi-Finals |
| Up to Mon 2026-11-16, 4:45 PM | 24h later, within 15 min | Week 10 |
| Mon 2026-11-16, 5 PM to the lock Tue 5 PM / 8 PM | After Week 10's results are posted (Tue night) | Week 11, Finale |

The cutoff is 24 hours (plus the cron's quarter hour) before the East
curtain, since `release_effective_week()` counts a week as aired from its
first night's `airs_at`, whatever the league's lock coast. A West-lock
league whose trade clears between 5 PM and 8 PM PT on Tuesday lands in
the Finale, even though its own Semi-Finals picks are still open; the
page says which week before anyone accepts. A window ending after the
curtain waits for Finish Week, so the trade is re-checked against who
actually went home.

### 3. Everyone can see a trade up for veto

`RosterMoves.trades` (`src/lib/league-triage.ts`) grows from
`{ offers, acceptedWith: string[][] }` to

```
{
  offers: { from; expiresAt }[];
  accepted: { with: string[]; vetoEndsAt: string }[];          // the viewer's
  vetoes: { between: string[]; vetoEndsAt: string; voted: boolean }[];  // everyone else's, window open
}
```

read by `loadHomeRosterMoves` (`trade_offers` with `trade_votes(manager_id)`
added to the select; RLS already shows every member an accepted trade),
so Home, Picks and the page dots agree.

- **Trades tab needs-you dot** (`rosterMoveTabs`): an offer waiting on the
  viewer, or a trade up for veto the viewer hasn't voted on.
- **Home league card** (`rosterMoveRows`): a gold dashed-circle row
  `Trade up for veto` (`2 trades up for veto`) with the clock
  `Ends in 20h` on the earliest window, until the viewer has voted on all
  of them; then nothing (a vote is their say, the result shows on the
  page). The viewer's own accepted trade keeps its hourglass row,
  `Trade with Kim`, and its clock becomes `Clears in 20h` instead of
  `At the run`. Not Picks Due: gold, like an open spot or an offer.
- **Transactions card on Picks** (`TradesStatusLines`): a gold
  `Kim and Pat's trade is up for veto · Ends tomorrow 5 PM PT` line per
  open window, dashed circle, dropping to a plain
  `Kim and Pat's trade, up for veto · You voted` once the viewer voted.
  The viewer's own reads `Trade with Kim, accepted · Clears tomorrow 5 PM
  PT` (`inSentence`). The empty line stays "No offer waiting on you."
- **Trades page**: the Up for Veto card is unchanged in placement.
  `VetoStatus` loses `clearsNextRun` and reads
  `Veto window closes tomorrow 5 PM PT. 0 of the 3 veto votes it would
  take. Takes effect then, for Week 10.` (or `… for Week 11, since Week
  10 will have aired.`; or `Takes effect once Week 10's results are
  posted, for Week 11.` when the window ends in the publish gap), the
  week from `releaseEffectiveWeek(weeks, vetoEndsAt + 15 min)` computed
  on the server from the season's episodes (the page already has them
  through `loadLeaguePageBase`); the quarter hour is the cron's tick, so
  a window ending at 4:50 PM Tuesday reads Week 11, as it will execute.
  The facts strip's second fact becomes `Couples move · Week 10`,
  replacing `Next run`, from the same helper at `now + 24h 15m`: it
  describes a trade accepted now, so from Monday 4:45 PM PT it says
  Week 11. The closed card's "There is no waiver run
  left…" becomes "There is no week left for a trade to take effect in."
  The Trade Log's executed line keeps naming the week.
- `TRADE_RULES` line 4 becomes: "A trade takes effect when its veto window
  closes. A traded couple starts scoring for their new manager in the next
  week that hasn't aired, and keeps scoring for their old one until then."
  Line 5 keeps "Points move when the trade takes effect…".

No new page, sheet or card; every line goes where its kind already sits.

### 4. What doesn't change

- The 24-hour veto window and its majority rule. A trade still can't be
  called off once accepted. No commissioner approval or waive (Kylie
  asked; left as a separate decision, with a per-league window length as
  the shape if wanted).
- The claim guard: a couple in an open or accepted trade can't be in a
  waiver claim and the reverse. A pending claim whose drop couple was
  traded away before the run already fails at the run (`not_held` on the
  claim's own holder check); a claim into a spot the trade just filled
  fails as `no_room`. Lists aren't rewritten on execution.
- Points land on the latest scored week, so a trade with a points leg
  executing on a week with no scores yet fails `no_scored_week`, as today.
- The trade deadline (the Semi-Finals lock) and the 48-hour offer lapse.
- Removal: `release_team` already cancels or fails the departed manager's
  trades and re-checks open windows against the smaller league.

### 5. Files

- `supabase/apply-trade-execution.sql` (new, safe to run again):
  `process_due_trades`, the `no_week_left` result, `assert_trades_open`,
  `run_league_trades` with the start-week guard. Applied after
  `apply-trades.sql` and `apply-remove-manager.sql`.
- `supabase/queries/schedule-recast-cron.sql`: comment only (the job is
  unchanged).
- `src/lib/trades.ts` (`TRADE_RULES`, `tradeEffectiveWeek` copy helper,
  `clearsBeforeRun` removed), `src/lib/league-triage.ts` (+ tests),
  `src/lib/home-roster-moves-data.ts`, `src/components/roster-moves.tsx`,
  `src/components/trades-panel.tsx`, `src/app/leagues/[id]/trades/page.tsx`,
  `src/lib/trades-db.test.ts`, `src/lib/trades.test.ts` (drops the
  `clearsBeforeRun` cases), CLAUDE.md, BACKLOG.md.
- No type regeneration: the app calls no new RPC; `result` is `text`. The
  inline check's generated name is `trade_offers_result_check`.

### 6. Tests (PGlite, the Trades fixture)

1. A trade accepted mid-week clears 24 hours later through
   `process_due_trades`: rosters swap from the first unaired week, points
   land on the latest scored week, `week_number` is the week before,
   `executed` with `start_week`; the later run reports `trades 0` and
   still awards claims; a claim whose drop was traded away fails.
2. A window that closes after a week's first night aired lands the trade
   in the week after.
3. A window that closes after the Finale's curtain fails `no_week_left`;
   accepting while no week is left is refused.
3b. A window that closes after a night aired and before it is published
   holds: nothing executes on that tick, and a waiver run due in the gap
   decides its claims without executing the trade; an aired exhibition
   night with no results doesn't hold; after Finish Week the trade
   executes for the next week, or fails `not_dancing` when a couple in it
   went home that night.
3c. Same tick: a due run and a clearing trade with points whose transfer
   would reverse two claimants' order; the run decides first, so the
   contested claim goes by the pre-trade order.
4. A trade clearing in the same tick as the run goes before the claims
   (today's test, kept).
5. `rosterMoveTabs` / `rosterMoveRows` for a trade up for veto, voted and
   not, and the viewer's own accepted trade's clock.

### 7. Release

Not before tonight's Week 9 run (Thu 2026-11-12, 9:59 PM PT), since the
SQL replaces functions the run calls. Order on Fri 2026-11-13: apply the
SQL (the job picks the new function up on its next tick), deploy the app.
Before the push: the two new rows and the page copy seen in the scratch
league with a trade in its veto window (throwaway accounts,
`scripts/qa-screenshots/seed.mjs`, Trades on by a direct `leagues`
update, scratch only), screenshots for Kylie, then Codex and a UX pass. A trade accepted between tonight and the apply sits as
`accepted` and executes on the first tick after its window closes. Read
back: the job row, `trade_offers` status after the first execution,
`roster_slots` for the two managers, `league_point_adjustments` if points
moved, and the three leagues' Home cards.

Known limits: execution is up to 15 minutes after the window closes (the
copy says "when the veto window closes"; the page's own time is the window
end). A trade can't be made effective for a week once that week's first
night has aired, whatever the league's coast. A future league whose
Lifeline lock falls before the curtain could have a trade fill a dead
spot after that lock (the Lifeline pick for it is dropped, as at the
run); not S35's shape.
