# A couple that changed hands: every holder keeps their points

Kylie, 2026-11-12 (late evening PT): after a trade or a waiver claim, the
points the earlier holder earned from the couple "disappear". She picked
**A1** for the Couples Leaderboard (one row per holding) and **B1** for Picks
(former couples stay in the roster list and in League at a Glance); mocks in
this folder. Reviewed by the advisor and Codex before the build; findings
folded in.

## As built (2026-11-13, not yet pushed)

Everything in the plan, app only. Codex reviewed the built code: no P1, four
P2s, each fixed and pinned by a test where the logic is pure: a couple
claimed back feeds every period into its current card's total (Picks passes
all of a manager's periods of a held couple); `judgePointsThroughWeek`
rounds once per couple over its periods, as the leaderboard does; the
Traded / Dropped reason comes from the period that immediately followed the
manager's, and "now with" from the holder in the paged week, so a later
transfer can't rewrite an earlier departure; Picks' no-week fallback is
clamped to the viewer's cutoff. Seen on live data in the scratch league
(a back-dated trade, Anchor Week moved to 8, throwaways deleted after): the
leaderboard rows, the Traded card and the glance line, the couple page's
two holders, no console errors. Not seen: a real trade or claim under this
code; the first will be the Kylie league's accepted trade on Fri 2026-11-13.

Known limit: a what-if row (nobody holds the couple) carries no weeks
label, and a couple released by a departed manager keeps its **Released**
row without weeks, since `heldByOthers` only counts rows with a holder.

**Doc text, to go into CLAUDE.md and BACKLOG.md once the trade-execution
commit is in** (the two changes share those files):

CLAUDE.md, Couples Leaderboard bullet, replacing "Owner is the couple's
current (else last) holder; …": "**One row per holder** (Kylie, 2026-11-12,
`docs/design/roster-history/plan.md`): a couple that changed hands has a
row for each manager who held it, over every period they did (dropped and
claimed back is one row), with that holder's own judges and bonus points,
so a manager's rows add up to the roster-earned part of their Dance Card
total (Lifeline and trade points stay out); the owner line adds the weeks
(`Pat · from Week 10`, `Kim · Weeks 8–9`, `holdingWeeksLabel`) when another
manager has held the couple. Holdings are clamped to what the viewer has
watched (`clampSlotsToWeek`: a holding starting at week N is public once
week N-1 is watched, an end past the cutoff reads as open), on Standings
and the couple page's In Your Leagues, which lists every holder, latest
first. An undrafted couple shows 'Undrafted' with what-if points from the
Anchor Week."

CLAUDE.md, Roster per-couple points bullet, after the first sentence:
"**Former couples stay on the card** (Kylie, 2026-11-12, B1): under the
current couples, a dimmed card per couple that left the roster before the
paged week (`formerSlotsForWeek`, periods ended at or after the Anchor
Week, not held again that week), tagged Traded when the period that
followed began by trade, Eliminated when the couple has gone home as far as
the viewer has watched, else Dropped (`formerCoupleNote`), with the weeks
and `now with Pat` for the holder in the paged week, +0.00 and the total
it earned; League at a Glance lists the same under each manager. A couple
claimed back is one current card over every period (`judgePointsThroughWeek`
sums a couple's periods, rounding once)."

BACKLOG.md, new section "A couple that changed hands — 2026-11-13": built
and reviewed (advisor and Codex, plan and code; no P1), app only, deploys
with the next push. Visible change for a viewer who is behind: the
leaderboard now hides a holding they haven't reached, where before it
named the open period's holder. Not seen live: a real trade or claim.
Known limit: the Released / what-if rows carry no weeks label.

## What happens today

- `buildCouplesLeaderboard` (`src/lib/couples-leaderboard.ts`) keeps one
  `roster_slots` period per couple, the open one or else the latest, and
  counts only that holder's weeks. After a trade the earlier holder's share
  is gone from the table, and a manager's rows no longer add up to their
  Dance Card total (the parity test only covers a couple with one holder).
  The couple page's In Your Leagues card reads that same row
  (`buildCoupleLeagueRows`, `src/lib/couple-leagues.ts`).
- Your Fantasy Roster and League at a Glance on Picks list the slots active
  in the paged week (`slotActiveInWeek`), with each couple's week points and
  running total for that holder (`judgePointsThroughWeek`). From the trade's
  start week on, the earlier holder never sees the couple again, while the
  card's header (stored `roster_points`) and Standings still count it, so
  the lines no longer add up to the header.
- Score History (lines per week by the slot active that week), the stored
  standings, Home's cards and the Lifeline, Recast and removal paths are
  unaffected. Standings has no roster cards.

## The change

### 0. Holdings are clipped to what the viewer has watched

Both surfaces take `leagueSlotPeriods`, every period of the league with no
cutoff (`league-page-data.ts`), and today's leaderboard already names the
open period's holder, so a viewer a week behind can read a trade or claim
off the owner line before watching it (Codex). One pure helper,
`clampSlotsToWeek(slots, cutoff)` (`src/lib/roster-couple-points.ts`,
tested), with the rule the Trade Log and Recast's awards already use: a
holding that starts at week N is public once the viewer has watched week
N-1. So it drops every period with `startWeek > cutoff + 1` and treats a
period with `endWeek > cutoff` as still open (`endWeek` null); an end at
the cutoff stays an end (advisor: tonight's claims start Week 10 with Week
9 the latest scored, and a caught-up viewer must see them, as Recast
already shows them). The cutoff is the viewer's spoiler state,
`cutoff.effectiveLatestEpisode?.week_number`, 0 before any week is scored
(so draft holdings from Week 1 are all visible). The leaderboard and the
couple page clamp to that; Picks clamps to the paged week, which the viewer
has watched. Every label below (weeks, "now with", another holder's
existence) is derived from the clamped periods, so nothing names a holder
or an end the viewer hasn't reached. Tests on both surfaces: a holding
awarded tonight (start = cutoff + 1) is visible to a caught-up viewer and
absent for a viewer a week behind, one that ends after the cutoff reads as
open, a couple whose only holding starts after `cutoff + 1` is Undrafted,
and the pre-scoring state keeps every draft holding.

### 1. Couples Leaderboard: one row per holder (A1)

`buildCouplesLeaderboard` returns one `CoupleStanding` per manager who has
held the couple (plus one what-if row for a couple nobody has held), over
all of that manager's periods of it (a couple dropped and claimed back by
the same manager is one row, Codex), each with that holder's own judges,
bonus and total points over the weeks they held it, clipped to the Anchor
Week and the shown weeks, as today's one row is. A row carries
`holdings: { from: number; to: number | null }[]` (its periods, in order)
and `heldByOthers: boolean`, so the component can say when. Ranking stays by
total, ties alphabetical by celebrity, then by the first `from`. Under v2/v3
a row is the sum of `heldCreditCents` over its periods; under v1 the week
loop credits the row whose period covers the week.

**Parity** (Codex): a manager's rows add up to the weighted roster-earned
part of their Dance Card total, `roster_points × weight`, trades and claims
included. Lifeline payouts and trade point transfers are manager-level and
stay out of this table (as CLAUDE.md already says); Standings' Dance Card
total includes them, and Score History lists them. The parity test gets a
mid-season trade and a claim in its fixture and checks against
`computeWeeklyScores`' roster part, under v1 and v3.

A released couple's period keeps its row (**Released**, as today).

Component (`CouplesLeaderboard`): the key becomes `coupleId:ownerId`. The
owner line reads as today for a couple with one row; with more than one it
adds the weeks after the name: `Pat · from Week 10`, `Kim · Weeks 8–9`,
`Kim · Week 9` for one week, `Kim · Weeks 2–3, from 6` for a couple claimed
back (`holdingWeeksLabel`, pure, tested). `isViewer` and the gold edge stay
per row. A row whose couple has gone home fades as today, whichever
holder's row it is. The couple page link is unchanged.

In Your Leagues on the couple page (`buildCoupleLeagueRows`): one row per
holding too, the league named once (`leagueName` on the first row of that
league only, `holding` label on each), newest holding first, so the viewer
sees "Pat · from Week 10 · 21.60" over "You · Weeks 8–9 · 15.20". A couple
nobody holds keeps its one Undrafted row.

### 2. Picks: former couples stay in the list (B1)

`judgePointsThroughWeek` already handles a slot that ended before `week`
(week points 0, total through its last week, both rules), so the change is
which slots are passed and how they render.

- **Which:** for the paged week, a manager's active slots as today, then
  their **former** couples: couples with a period of theirs that ended
  before `week` and at or after the Anchor Week (a period that ended before
  the Anchor Week never scored and is not shown), that they don't also hold
  in the paged week, newest end first. A couple the manager holds in the
  paged week after an earlier period of theirs (claimed back) is one
  current card whose total covers every period they held it (Codex):
  `judgePointsThroughWeek` takes all of a manager's periods of a couple and
  sums the totals per couple instead of overwriting (the week points come
  from the period active that week). Only periods that have ended make a
  former card; an eliminated couple still in its slot stays a current
  couple with its Eliminated tag, as today. One former card per couple,
  over all of that manager's ended periods of it, labelled with every
  range.
- **Why it ended** (`formerCoupleNote`, pure, tested, in
  `src/lib/roster-weekly-points.ts`): from the couple's next period in the
  league, if any (`roster_slots.source` of the row that starts the week
  after): `trade` → tag **Traded**, sub-line `Weeks 8–9 · now with Pat`;
  otherwise, if the couple's spoiler-safe status for the paged week is
  eliminated or withdrawn → tag **Eliminated**, sub-line `Weeks 8–9`; else
  tag **Dropped**, sub-line `Weeks 8–9` plus `· now with Pat` when someone
  holds them in the paged week. The name in "now with" is the holder in the
  paged week (a claim or trade that started at or before it, which the
  viewer can see since they have watched that week; a later holder is not
  named). `RosterWeeklyTag` grows `traded` and `dropped`, with `TAG_INFO`
  entries in the muted style.
- **Render:** `RosterCard` gets a `former?: { weeks: string; note: string | null }`
  per couple; a former couple's card is dimmed like an eliminated one, the
  sub-line sits under the name above the tag, right side `+0.00` and
  `15.20 total`. The couple link works as for any couple. The League at a
  Glance entries (`DanceCardLeagueEntry.couples`) take the same shape and
  the list renders the sub-line in small muted type under the name, dimmed.
  Survival & Bonuses and the Lifeline lines are unchanged. The header (the
  paged week's points) is unchanged too; what changes is that the totals
  column now accounts for every judges' point the manager has earned.
- Paging back to a week the manager still held the couple shows it as a
  current couple for that week, as today; the former card appears only on
  weeks after the holding ended.
- `weeklyBonusPoints` keeps taking the current couples' week points only
  (a former couple's +0.00 changes nothing).

### 3. What doesn't change

Scoring and stored rows. Score History. Standings' Managers Leaderboard and
Dance Card totals. Home cards. Recast's wire and Adds and Drops. The
Couples Leaderboard's heading, columns and the what-if for an undrafted
couple. The Spoiler-Free cutoff: both surfaces already take spoiler-clamped
couples and weeks, and a holding that ended after the viewer's cutoff is
simply not yet in the shown weeks, so its row (A1) is clipped to the shown
weeks and its former card (B1) doesn't exist until the viewer pages there.

### 4. Files

- `src/lib/couples-leaderboard.ts` (+ test), `src/components/couples-leaderboard.tsx`,
  `src/app/leagues/[id]/standings/page.tsx` (row mapping, key),
  `src/lib/couple-leagues.ts` (+ test), the couple page's In Your Leagues card,
  `src/lib/roster-weekly-points.ts` (+ test: tags, `formerCoupleNote`,
  `holdingWeeksLabel` lives beside it or in `format-week.ts`),
  `src/lib/roster-couple-points.ts` (a `formerSlotsForWeek` helper + test),
  `src/components/roster-card.tsx`, `src/components/dance-card-league-list.tsx`,
  `src/app/leagues/[id]/picks/page.tsx`, CLAUDE.md, BACKLOG.md.
- No SQL, no types. `roster_slots.source` joins the select behind
  `leagueSlotPeriods` in `league-page-data.ts` (`RosterSlotPeriod` grows an
  optional `source`). `judgePointsThroughWeek` is called only from Picks
  (the Lifeline, Home and draft-night loaders use `slotActiveInWeek` alone),
  so summing per couple changes no other surface.

### 5. Tests

1. Leaderboard: a couple held by Kim (Weeks 8–9) then Pat (from 10) gives
   two rows with each holder's own points; Kim's and Pat's rows add up to
   `computeWeeklyScores`' Dance Card totals; a couple claimed back by its
   first holder gives two rows for that manager; the what-if row is
   unchanged; v3 ledger rows match `heldCreditCents` over each period.
2. `holdingWeeksLabel`: from / range / one week.
3. `formerSlotsForWeek` and `formerCoupleNote`: trade, drop onto the wire,
   drop then claimed by another manager, eliminated and refilled, period
   before the Anchor Week, claimed back and held now (one current card, both
   periods' points, v1 and v3), claimed back and dropped again (one former
   card, both ranges), paged to a week inside the holding.
3b. `clampSlotsToWeek`, and `judgePointsThroughWeek` summing two periods of
   one couple.
4. `buildCoupleLeagueRows`: two holdings in one league, league named once.

### 6. Release

App only; deploys with the next push. Before the push: the scratch league
(throwaway accounts) with a couple moved between two managers by a direct
`roster_slots` edit back-dated into scored weeks (old row `end_week = 8`,
a new `trade` row from Week 9; scratch only, since the roster carousel
pages scored weeks only, so a real trade starting Week 10 shows nothing
until Week 10 scores); then screenshots of Standings'
Couples Leaderboard, Picks' roster card and League at a Glance for both
managers, and the couple page's In Your Leagues. Kylie sees the real thing
in her league once its accepted trade executes (Fri 2026-11-13 evening).
