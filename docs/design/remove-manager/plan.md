# Removing a manager after the draft

Kylie, 2026-11-12: work out how a commissioner removes a manager and
releases their Dance Card roster to the waiver wire. Reviewed by the
advisor and Codex before the build (their findings are folded in below).

## As built (2026-11-12, not yet applied live)

`supabase/apply-remove-manager.sql`, `src/lib/remove-manager.ts` (the
effective week mirror and the dialog copy), `remove-manager-db.test.ts`
(seven PGlite cases on the Trades fixture), the Remove and Leave dialogs,
`Released` lines on the Adds and Drops fold and Home's Recent Activity
(`kind: "release"`), the Couples Leaderboard's **Released** holder, and
CLAUDE.md. Two things differ from the plan text below: Home's release line
reads "Kim left, releasing Harry & Witney and Alix & Val in Alpha" (one
line per manager, their couples together), and the concurrency fix is a
deferred constraint trigger on `lifeline_picks`, `waiver_claims` and
`trade_parties` rather than moving the lock in three writers, since it
closes the window for all three in one place. Codex reviewed the built code
(no P1; five P2s, each fixed and pinned where PGlite can: the trigger and
`join_league` take the league lock, every delete is scoped to the active
season, `league_departures` backs the rejoin refusal for a manager with
picks but no roster, the target's membership row is locked through the
removal so a promotion can't slip in, and Home's release line falls back
to the nearest earlier week with a night).

## What happens today

`remove_league_member` (and `leave_league`) delete the `league_members` row
and nothing else. After the draft that leaves a ghost team:

- Their `roster_slots` rows stay open (`end_week` null), so the
  `roster_slots_one_current_holder` index and `save_recast_list`'s holder
  check still see the couples as held. Nobody can claim them, ever, and the
  Couples Leaderboard shows their holder as "Unknown" (the name map is built
  from members).
- Publication scores by roster and prediction rows, not members (the
  snapshot has no `league_members` key; `computeWeeklyScores` takes the
  union of managers with inputs), so the ghost keeps earning
  `weekly_manager_scores` rows every week. Every reader builds standings
  from `league_members`, so the rows are invisible, but Lifeline settles the
  ghost's pick too (both `lifeline_publication_inputs` and
  `apply_lifeline_settlement` read every pick, with no member filter, so
  they agree and a publish is not blocked).
- Their pending `waiver_claims` are marked `taken` at the next run (the
  run's final sweep). An open trade they are in fails at the run with
  `left_league`; an accepted one too, so the other side waits a run to
  learn it.
- `recast_order`, veto thresholds (`league_members` count) and the league
  switcher already ignore them.

Neither RPC is blocked after the draft, and the Members card shows Remove
whenever the viewer is a commissioner, so this can happen today.

## The rule

Removing a manager after the draft is a drop of their whole roster, done
the way `run_recast_claims` does a drop, at the first week that hasn't
aired. Their points through the last week they held the roster stay in the
league's history; from the effective week the couples are nobody's.

**Effective week** (`v_start_week`): the first week of the season whose
first night hasn't aired, the same expression `recast_next_cycle` uses for
`start_week` with the run time taken as now. Once every week's first night
has aired (between the Finale's nights, or after it) there is no such week:
the effective week is then the last week plus one, so they keep the Finale
and every open row closes at the last week. A week that has aired but not
published is wholly theirs: they held the roster when it aired, so its
roster rows, its Curtain Call pick and its Lifeline pick stay and score for
them one last time when it publishes. Only weeks that haven't aired are
cleared.

## By table

Inside one transaction, under the same `leagues` row lock the run takes
(`perform 1 from public.leagues where id = p_league_id for update`), so a
removal can't interleave with a run or a trade. `set_lifeline_pick`,
`save_recast_list` and `propose_trade` check membership before they take
that lock (or take none), so a write in flight could land after the
removal (Codex): those three take the league lock first and resolve
membership after it. PGlite is single-connection, so that race is a code
change with no test; say so in the test file.

| Table | Action |
|---|---|
| `roster_slots` | Every row of theirs that reaches into the effective week, open or closed: rows starting at or after it are deleted (a claim they won for a week not yet aired, or a trade's incoming couple); rows that start before it get `end_week = effective week − 1`, whether open or already closed later (a won claim closes the old couple's row through the week before its start, so leaving that closed row would let two managers score the couple in the same week; Codex P1). The couples are free on the wire at once. |
| `waiver_claims` | Their pending claims: delete. Nobody else's claim can name a couple they held, so there is nothing else to cancel; from release the couples are claimable like any other. |
| `lifeline_picks` | Their picks for weeks from the effective week on: delete. The aired week's pick and every settled week's payouts stay. |
| `trade_offers` | Any offer they are a party to, in one statement (`update … set status = case … end where id in (…) and status in ('proposed', 'accepted')`, so a concurrent `respond_to_trade`, which takes the same `leagues` lock, re-checks its own status predicate): `proposed` → `cancelled`; `accepted` → `failed`, result `left_league`, so the Trade Log explains it now rather than at the run. Couples those offers held out of waiver drops are released by that. |
| `predictions` | Rows for weeks that have aired (published or not): keep. Weeks from the effective week on: delete (nothing has been earned on them). |
| `grand_finale_predictions` | **Keep.** A correction republish rebuilds a week's Grand Finale points from the bracket that exists then, so deleting it would wipe their settled bracket points from history the next time an earlier week is corrected (Codex). The bracket keeps paying the ghost on later weeks, into score rows no reader shows. (Decision 1 revised.) |
| `draft_queues` | Delete. |
| `grand_finale_late_unlocks` | Open unlock: delete. |
| `trade_votes` | After the membership row goes, re-check every accepted trade in the league still inside its veto window against the new team count: the votes already cast may now be a majority, and today the majority is only tested when a vote is cast (Codex). A trade that now has enough votes is marked `vetoed` in the same transaction. |
| `weekly_manager_scores`, `lifeline_payouts`, `league_point_adjustments` | Keep. Published history stands; the leaderboard, rank moves, Score History, Home card and switcher all start from `league_members` and never show them. The Equalizer rows are per manager and stay. A correction republish of an earlier week recomputes their row from the rows that still exist (roster periods, aired-week picks, the kept bracket), so it comes out the same. |
| `roster_releases` (new) | One row per freed couple: league (cascading FK, so `delete_league` keeps working), manager id and **display name at release time** (the name lookup for a departed member otherwise reads "Someone"), couple, effective week, released at. `reset_draft` clears it with the other roster tables. |
| `league_members` | Delete last. The co-manager goes with the row, as today. |

`join_league` allows a league whose draft is complete (it refuses only a
draft in progress), and every team table is keyed by the user id, so a
removed manager who used the invite code again would reconnect to their
old score rows with no roster (Codex). So **`join_league` refuses a user
who has history in that league once its draft is complete** ("You were
removed from this league after its draft"), and the Remove dialog says the
removal can't be undone. (Decision 5.)

## What the wire shows

- **Recast on:** the freed couples are free the moment their rows end, show
  on The Wire, and can be claimed in the next run. A claim scores from that
  run's own start week, which can be later than the effective week when the
  run falls after the next week starts (the 48 hours after results); in
  between, the couple is nobody's. The run's reverse Dance Card order decides contested claims as for
  any other couple. The Adds and Drops log gets one line per freed couple
  (`Released: Harry & Witney, from Kim's roster`), read through RLS and
  spoiler-gated like awards, for consistency rather than need (a release
  gives away no elimination). Home's Recent Activity gets the same line
  under that week.
- **Couples Leaderboard:** `buildCouplesLeaderboard` keeps a couple's latest
  holder after `end_week` is set, and Standings maps that id through the
  members, falling back to "Unknown". One reader change: a holder who is no
  longer a member renders as **Released**, and the row keeps the points the
  couple earned while held (the builder's rule for a dropped couple), not a
  what-if. Once another manager claims the couple the new holder shows.
  Your Fantasy Roster and the Home card start from members and need nothing.
- **Recast off:** the couples read Released on the Couples Leaderboard and
  nobody can take them unless the commissioner turns Recast on. That is
  the behavior, not a gap: a league with no waiver wire has no way to move a
  couple, and a commissioner hand-assigning couples is a different feature.

## What doesn't change

- Dance Card v3 rates are keyed to roster size, not team count.
- Curtain Call payouts scale by couples remaining, not teams.
- `recast_order` and `vetoVotesNeeded` already count current members only.
- Trades' cash cap is per manager from their own earned points.
- `scripts/dance-card-v2.ts --verify` and `recompute-published-weeks.ts`
  work from score rows, and nothing before the effective week changes, so
  `--verify` still matches after a removal.
- The draft (`draft_picks`, `draft_position`) is history once complete and
  is not touched. Before the draft starts, removal stays what it is today:
  delete the membership row. During the draft it stays refused.

## `leave_league`

Same hole, same fix: a manager who leaves after the draft gets the same
cleanup. The RPCs share one internal `release_team(p_league_id,
p_user_id)` (service-internal, no grants) and keep their own
authorization: commissioner only for `remove_league_member`, self only for
`leave_league`, with its existing co-manager and commissioner refusals.
(Decision 3 below.)

## UI

Remove stays on the Members card in League Settings. After the draft the
confirm dialog says what it does, in sentence case:

> Kim's couples go to the waiver wire from Week 10. Their points through
> Week 9 stay in the standings history. Their open waiver claims and trade
> offers are cancelled. This can't be undone.

With Recast off, the first sentence reads "Kim's couples become undrafted
from Week 10; turn on Recast to let managers claim them." Leave League's
dialog (League Info) says the same for the viewer's own roster. No new
page, no new setting.

## Build

- `supabase/apply-remove-manager.sql`: `release_team`, the two RPCs
  recreated on top of it, `recast_released` rows for the log (or a `kind`
  on an existing log table; decide at build), applied by Kylie, safe to run
  again. Not for tonight: nothing in it touches the 10 PM run.
- `src/app/leagues/[id]/settings/actions.ts` / `league-members-section.tsx`
  / `leave-league-button.tsx`: the dialogs' consequences, from a small
  server read (effective week, Recast on or off).
- Adds and Drops and Recent Activity readers: the released lines.
- `remove-manager-db.test.ts` (PGlite, on the Trades fixture's stack, which
  includes `apply-trades`, with `draft_status = completed` seeded): a removal mid-season frees the couples and the next run
  awards one; a removal with a pending claim, an accepted trade and a
  Lifeline pick for a week not yet aired cancels each; a removal after a
  claim they won for a week not yet aired deletes that row; their published
  weeks' scores still sum the same; a removal between air and publish keeps
  the aired week's roster, pick and Lifeline pick, that week's publish
  writes their row and the next week's writes none; the Couples Leaderboard
  reads Released; the pre-draft path still just deletes the row; Leave
  League after the draft takes the same path; a correction republish of an
  earlier week leaves their row unchanged; a removal with votes already
  cast on an accepted trade vetoes it when they now carry; a removal
  between the Finale's nights keeps the Finale; a stale Lifeline
  publication plan built before the removal is refused and a fresh one
  goes through; `join_league` refuses the removed user.
- Scratch league in the browser for both dialogs.

## Decisions (Kylie accepted every lean, 2026-11-12)

1. **A removed manager's pick for a locked-but-unpublished week.** Lean:
   delete it with the rest. Their roster still scores that aired week
   (they held it), but a Curtain Call pick paying a team nobody can see is
   a ghost row for nothing. The alternative, keeping it, costs nothing in
   standings and keeps the record of what they picked.
2. **Hard delete or a `left_at` on `league_members`.** Lean: hard delete
   plus the cleanup. Every reader and `is_league_member` already assume the
   row is gone, and the history that matters stays in the score tables.
3. **Leave League after the draft.** Lean: allowed, with the same release.
   The alternative is to refuse it after the draft and route a manager who
   wants out through the commissioner, which is simpler to reason about
   but leaves a manager who has stopped playing on the board.
4. **The log line.** "Released" (the fantasy-sports word for a team cutting
   a player) or "Dropped"? Lean: Released, since Dropped is already a
   manager's own waiver action.

Revised after Codex (2026-11-12), awaiting Kylie:

1. **Bracket:** keep it rather than delete it (above). Curtain Call picks
   for weeks not yet aired are still deleted.
5. **Rejoining:** refused after the draft for a user with history in the
   league. The alternative, letting them back in as the same team, would
   restore their points with no roster.
