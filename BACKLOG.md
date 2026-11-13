# Backlog — to be dealt with later

Things explicitly deferred during development, not tracked anywhere else. Not a full feature roadmap — just the "don't forget this" list.

## Trades take effect when the veto window closes — 2026-11-12

Built 2026-11-12 (`docs/design/trade-execution/plan.md`; CLAUDE.md describes
it). Kylie applied `supabase/apply-trade-execution.sql` live after the Week
9 waiver run on 2026-11-12 (the cron job is unchanged); the app deploys with
the next push. The one accepted offer at the time executes on the first
tick after its window closes, Fri 2026-11-13 about 7:30 PM PT, for Week 10.
- The same-tick order case (a due run and a clearing trade with points
  that would reverse two claimants' priority) is settled by ordering, the
  runs before the trades inside `process_due_recasts`; no test of it.
- `assert_trades_open`'s "no week left" refusal is behind the deadline
  check, so no test reaches it. Also untested (Codex, code review): a waiver
  run coming due inside the publish gap, and a trade with a points leg
  executing outside a run.
- Codex's code review (2026-11-12): no P1, two P2s, both fixed (the page
  reads an overdue window at the next tick, not its end; the hold copy is
  per night, so a two-night week between its nights doesn't say it waits).
- Execution is up to 15 minutes after the window closes; the page's time
  is the window end.
- Seen in the scratch league (throwaways, deleted after): the Home card
  row, both Transactions card lines, the Trades page copy and the facts
  strip, no console errors. Not seen live: a trade clearing and moving
  couples outside a run.

## Curtain Call podium and Home card moves — 2026-11-11

Pushed 2026-11-11 (`CLAUDE.md` describes each): Curtain Call's Finale podium,
the own-dances-first order, the Dance Card weight line on Picks and the roster
moves lines on the Home league card. `supabase/apply-curtain-call-podium.sql`
was applied live by Kylie and read back (columns, both RPCs; regenerated types
match).

Still open:
- Kylie runs `supabase/apply-curtain-call-podium.sql` once more: after her
  apply, `submit_podium_prediction` gained a check that every picked couple is
  in the week's season (Codex review; the app never sends another season's
  couple, so nothing depends on it). The file is safe to run again.
- The podium form and recap have run in tests and against made-up data only:
  Week 11 picks open after Week 10's results (Week 10 airs Nov 17), so look at
  the live Picks card then. The Home card's move lines were also seen with
  made-up data only (the scratch league has no Lifeline, Recast or Trades).
- The podium pays half for one place off, nothing for two
  (`PODIUM_PLACE_OFF_FRACTION`); the first mock had a third per place. One
  constant if Kylie wants thirds.
- At 360px the Home card's "Need Lifeline pick" wraps to two lines.
- One undrafted, unscored test league is still on Dance Card v1; Kylie said to
  leave it (2026-11-11).

## Finale follow-ups — 2026-11-11

Offered to Kylie, not answered and not built:
- Real 4th Place / 5th Place outcomes (needs SQL). Today both are entered as
  Eliminated in the Finale week and share spots, so Grand Finale, Curtain Call
  and Dance Card can't tell them apart.
- A Finish Week guard for a season with no week ticked Finale (the engine
  falls back to the last scheduled week).
- An automatic rescore when the Finale tick is set or moved after weeks are
  published (today each week needs a republish or
  `scripts/recompute-published-weeks.ts`).
- `couplePath` in `src/lib/strong-play-ceilings.ts` still gives 4th place no
  Finale survival; re-solve the v3 rates with it for a future season, not S35.

## Free agency after the waiver run — next season

Kylie (2026-11-12) asked about a second waiver run 24 hours before each
show and agreed it isn't one: a run then would award from the same start
week as the post-results run. What she described is football's free
agency, a first-come add window between the run and the lock (the dropped
first-come RPC did this). Not for S35 (one run left, about 2026-11-19).
For S36: free agency after the run until the lock, first come; decide
whether a couple dropped in that window is instantly claimable or sits on
the wire until the next run.

## Remove a manager after the draft — 2026-11-12

Built 2026-11-12 (`docs/design/remove-manager/plan.md`, As built;
CLAUDE.md describes it). Pushed as `06f4b02` and
`supabase/apply-remove-manager.sql` applied live by Kylie on 2026-11-12
(`roster_releases` and `league_departures` read back present and empty). Her
apply predates the file's service-role grant on `release_effective_week`,
which nothing in the app calls; the file is safe to run again.
- The race the triggers close (a pick, claim or offer committing after the
  removal) has no test: PGlite is single-connection.
- A correction republish of an earlier week after a removal is argued, not
  tested (the bracket and aired-week picks stay, so the row recomputes the
  same); `remove-manager-db.test.ts` has no correction case.
- The Couples Leaderboard shows a released couple with the points it earned
  while held, not a what-if, until someone claims it.
- Not built: a way for a commissioner to hand a released couple to a team
  in a league with Recast off.
- On the Trades page a cancelled or failed offer names the departed party
  through the members map, so they read as "Unknown" there (the Trade Log
  line itself says the trade didn't go through because a manager left).

## Adversarial audit of the paths not yet run live — offered 2026-11-12

Kylie deferred it (2026-11-12). Scope if picked up: PGlite scenarios shaped
like the real data plus an independent Codex pass, read-only against live.
1. The waiver run under the Dance Card order (`run_recast_claims` with four
   claims on one couple in one league; `run_league_trades` with an offer
   accepted inside the window; the order is set before trade points move).
   The first real run was Thu 2026-11-12, 10 PM PT.
2. Lifeline settlement inside E11's publish (first live run, three leagues,
   ten picks, Equalizer stored), the lock, and a manager who never picks.
3. A trade with a points leg: cash cap, `no_scored_week`, never run live.
4. The Finale chain under this code: podium picks, v3 survival for every
   finalist, Grand Finale distance split across places, 4th and 5th both
   entered as Eliminated.

## Waiver order by Dance Card — 2026-11-13

Kylie's call (2026-11-13): the waiver order is reverse Dance Card standings
(raw `roster_points` × the league's Dance Card weight plus the already
weighted Lifeline and trade points, as Standings shows the Dance Card
total), not reverse total standings, since a claim can only change Dance
Card points. Built in `supabase/apply-recast-dance-card-order.sql`,
`recastOrder`, the Waiver Order fold, `RECAST_RULES` and the tests.
- Applied live by Kylie on 2026-11-12 (about 5 PM PT), before the Week 9
  run, and read back: new columns, order matching the Dance Card table in
  all three leagues. She chose before rather than after, since in both
  leagues with claims the claimants keep the same relative order either
  way. The app (`0310b93`) was pushed the same hour; until Vercel has it
  the fold shows the old order while the run uses the new one.
- The last run of S35 is about 2026-11-19, so the rule decides tonight's run
  and one more this season.
- The Dance Card figure in the fold no longer matches the leaderboard beside
  it; the fold's intro says what it is.

## Lifeline, Recast and Trades — 2026-11-11

Released 2026-11-11 (`docs/design/lifeline-recast-trades/plan.md`, As Built):
the SQL is applied live, the app deployed, types regenerated.

Live-tested 2026-11-11 in a scratch league with throwaway accounts (Recast
and Trades; Kylie ran `process_league_recast` in the SQL Editor, since the
service role can't call it): offer privacy, outsider can't accept, no veto
or cancel by a party, one outside vote vetoes, invalid offers refused;
claims on held or eliminated couples refused, a paired drop shows as a
pending drop; the run awarded two claims (a contested couple went to the
earlier manager, the loser's fallback took the dropped couple), executed the
accepted trade, left the vetoed one, stamped one `recast_cycles` row, and
the pages, Home card and Recent Activity read right. The league was deleted
after. Still unchecked:
- A points leg in a trade, and the open-offer / waiver-claim guard: both
  test offers were refused by an earlier check first. PGlite tests cover them.
- Lifeline end to end against the live project. Seen live 2026-11-12 in a
  scratch league (throwaway accounts, deleted after): the turn-on sheet
  with an empty Equalizer ("No roster spot sat idle before Week 10"), the
  enabled Settings row, the Transactions card and Open Lifeline on Picks,
  the Lifeline page with no open spot, and Turn Off; no console errors.
  Still made-up data only: Equalizer amounts above zero, a pick, the lock
  and settlement. A scratch league can't reach them before E11 publishes:
  the draft only takes couples still dancing, so no spot is dead, and the
  league has no scored week. **The real leagues already have**: the three
  West-lock leagues turned Lifeline on from Week 10 with the Equalizer
  (read 2026-11-13: 16 `lifeline_equalizer` rows, ten Week 10 picks by six
  managers, every picked couple still dancing). So the lock (Tue
  2026-11-17) and the settlement inside E11's publish are the first live
  runs of those paths; `apply_lifeline_settlement` refuses a plan without
  payouts, and the night is rehearsed in the PGlite tests. After E11
  publishes, check `lifeline_payouts` against the picks and
  `scripts/dance-card-v2.ts --verify`.
- The Home card says "Ends in 1d" for a 48-hour offer (largest unit, floored).

Known limits, none fixed:
- `saveLifelinePicks` clears then sets in two calls, so it isn't atomic.
- The Equalizer is refused when a manager has no `weekly_manager_scores` row on
  the latest scored week.
- `reset_draft` doesn't clear `recast_cycles`.
- `save_recast_list` accepts claims when a cycle exists but its `start_week` is
  null.
- In a two-night week a couple eliminated on night 1 can still show as a drop
  or wire option.
- A member with no roster rows could claim into slots 1..roster_size.
- A proposed trade offer holds its couples out of their owner's waiver drops
  until it is declined, cancelled or lapses (48 hours).
- A trade accepted less than 24 hours before a run waited for the next run
  until 2026-11-12 (trades now take effect when the window closes).
- With Recast off and Trades on, Trades copy still says "waiver run".
- Not built: a Lifeline need line / Picks Due on the Home league card, and
  Lifeline lines on Standings' roster card.
- Not built: a "trade offer waiting" row on Picks, and one combined
  Transactions page (waiver awards are on Recast, trades on Trades, both on
  Home's Recent Activity). Kylie wants to use the build first.

Codex reviewed the built code (2026-11-11): four P1s, each reproduced, fixed
and covered by a PGlite test (waiting claims keep their place in the order,
re-applying the Recast SQL keeps saved lists in order, claims can't join a run
that came due before Recast was turned on, a departed team's veto vote stops
counting). No authorization, privacy or points findings.

## Dance Card v3 rollout — 2026-11-10

Kylie replaced v2's season curve with v3 before E10 (`docs/design/dance-card-v3/`):
one judges' rate (0.2731 for two-couple rosters), survival 3.00 × √(safe
weeks), Fantasy Bonus at face value, no placement. Done 2026-11-10:
`apply-dance-card-v3.sql` applied and verified (constraint, all four functions,
grants); `main` pushed (`4fd806d`), Vercel success; a throwaway v3 league
checked in the browser against live data (Standings, Score History, Couples
Leaderboard, Picks, League Settings, no console errors); all four leagues
switched v2 → v3 with commissioners' OK, `--verify` matches, Curtain Call and
Grand Finale unchanged on all 175 rows. Codex reviewed the commit: one P1
(correction cascade dropped outcomes) fixed in `4fd806d` with a test.

Still to do:
- E10 (tonight) is the first live v3 publish, rehearsed in
  `dance-card-v3-night-db.test.ts`. Contributors reload Enter Results first
  (a pre-deploy tab sends plan version 4, which is refused). Run `--verify`
  after it publishes. If Finish Week fails mid-night, a league can't switch
  while scores are posting: un-post first, then `--apply --to v2` or
  `--rollback`.
- `apply-dance-card-v3-default.sql` is applied live (read back 2026-11-11); one undrafted, unscored test league is still on v1 and stays there (Kylie, 2026-11-11).
- Kylie looks at a real v3 league on her phone (Score History survival lines,
  Picks Survival & Bonuses row with stored weekly rows).
- Optional: tell Carrie Ann's Biggest Fans that Dance Card is weighted 8× there,
  which is where a bad couple can still sink a manager (the weight, not the
  formula).
- Types weren't regenerated; no schema shape changed (only a check constraint).

Settled (Kylie): Score History keeps v1's wording (v3: `Harry: Jdg 30 × 0.273`,
then Survival and Bonus lines). League Settings shows a v2 league the Season
Curve explanation (no survival/placement sentence) and a v3 league the rate
and "3.00, Tapering" read-only. Roster spread has no floor under a flat rate
(bigger front-loaded survival keeps lowering it into a handout), so the
survival budget was picked as ~13% of a long run, spent early. Known limit
from v2: on a v1 draft night a two-night week still shows judges-only Dance
Card. `start_draft` moving the Anchor Week on a v2/v3 league with scores is
refused by the trigger.

## Adversarial review of 2026-11-05/06 work (advisor + Codex)

Verified against the code. All six bugs fixed 2026-11-06 (Kylie: no tap
cue; couple page names a special dance as type + name; dance count includes
heats). The live-night refresh and the posting line are not yet seen on a
real night. Bugs as found:
- Night Summary reads a dance-off loser's 0 as "Dance-Off 1 0" (looks like
  "Dance-Off 10"): `nightPartScore` signs only positives. Sign every bonus,
  0 and U+2212 included; move it beside `buildNightSummary` with a test.
- Home says "Ezra earned +0 in Dance-Off 1" for every dance-off loser: no
  zero filter in `buildRecentActivity`. Drop zero bonus lines, as Results does.
- On the couple page the bottom tab it was opened from is a dead span
  (`FanTabItem` renders the active tab unlinked), so tapping Results does
  nothing; the other tabs use the first league, not the one it came from.
- A long special-dance name in a closed picker can't shrink (name
  `shrink-0`) and pushes past the chevron.
- Opening a couple from Your Fantasy Roster drops `rosterWeek` / `week` from
  the back link; Standings returns to the top, not the Couples Leaderboard.
- The couple page never refreshes on a live night (no `RevealAutoRefresh`),
  so "Posting Live" freezes; a viewer who hasn't opted in sees no line saying
  the week is posting.

Decisions for Kylie:
- No visible cue that Results cards, leaderboard rows and roster cards open
  a couple (no chevron; hover only on desktop).
- The couple page uses short names ("Slaytopia"), where the approved mock
  had "Team Dance · Slaytopia"; it has room for the full name.
- Dance count leaves out dance-off heats (they're points rows); immunity
  should stay out, heats arguably count.
- Mixed scales: raw dance totals beside "Average · of 30" and the Night
  line's converted score.
- West feed: after East publish, a West viewer who chose Stay Updated sees
  that week's outcomes. Kylie (2026-11-06): guard, not mask. Finish Week now
  asks first from the East curtain until 10pm PT (every S35 week so far was
  finished after 10pm PT). Codex found the leak is not two pages but every
  outcome surface: Home league cards (strikes, Next elim, rank/points),
  Standings (totals, arrows, Score History, Couples Leaderboard fading),
  Picks (Curtain Call recap, Grand Finale lists, rosters), Results gold
  bracket lines, Recast/waivers, guests. A real mask would need separate
  score/outcome eligibility and judges-only standings, plus a refresh at
  10pm PT (`RevealAutoRefresh` stops at the window's end). Home's own mask
  also lets a no-elimination week's overtakes through
  (`week.eliminated.length > 0`).

## Long special-dance names — inventory 2026-11-05

Rule A chosen 2026-11-06 (see CLAUDE.md Special Dances "Naming"); the app
side is done: fan Results, couple history, Home, member cards, Night
Summary, both special-dance pickers (render-checked on E09 and E10 at 360px,
writes blocked), and SQL error messages (`apply-special-dance-label.sql`,
applied live 2026-11-07). Still to see:
- Not yet seen: a Special Dances band entry (only on-air dances outside the
  plan land there) and a signed bonus in the Night Summary on a real night.

Kylie wants long dance names fixed everywhere. Every place a special dance
adds to a displayed name (360px behaviour inferred from CSS, not rendered):

Fans (guests too where noted):
- Results card lines, `night-dance-lines.ts` `styleLabel`/`danceLine`:
  `Team Dance · Slaytopia · Zoo (Zootopia 2)`; legacy `Freestyle (Team) · …`;
  a lone bonus `Dance-Off · +3`; an immunity row reads only `Immunity`
  (loses the round). Wraps; the card has no `min-w-0`. Guests too.
- Couple history (`/couples/[id]`): same label, song on its own line; Best
  tile sub-label wraps to three lines for a team. Guests too.
- Home Recent Activity: `Harry earned +3 with Dance-Off Immunity`,
  `… in the Dance-Off`; judged specials say only the style (`scored 36 on
  their Freestyle`).
- Spoiler-Free / draft strip: `Latest: Dance-Off Immunity · 6/16`, truncated.

Contributors and admins (Enter Results):
- Couple picker Special Dances band: name + Dance Type badge + Posted, first
  names under it; the menu doesn't wrap and clips sideways.
- Round picker: `Dance-Off 2 · Harry and Maura · Posted` (members truncate).
- Placeholder heat: `Dance-Off 2 isn't set up yet.` / `Set Up Dance-Off 2`.
- Round tabs and notes: `Round 2 · Bottom-Two Dance-Off`, the elimination
  round note.
- Member card lines: `Team Dance · Slaytopia` + `Open →`, then
  `Freestyle · Zoo (Zootopia 2) · Posted`.
- Night Summary (card and Leaderboard): `Individual 28 + Slaytopia 36 +
  Dance-Off 3` (name for a team, type otherwise).
- Finish Week: `Slaytopia and Dance-Off Immunity are not fully scored…`.
- Special dance entry: header name + badges, read summary
  `Freestyle · "Zoo (Zootopia 2)" · Host Alfonso Ribeiro`, Dance Type input
  and suggestions, `… already in another Team Dance tonight.`,
  `Fix the judges' marks on Dance-Off Immunity first.`
- Scores and Schedule badges: the round type (`Team Dance`).
- Edit Episode: round names, heat headings, `Named Dance-Off 1 to
  Dance-Off 3 on Enter Results.`, `Harry is in Dance-Off 1 and Dance-Off 2.`

Errors from SQL (`special_dance_label` = `Team Slaytopia` for a team, else
the name) and Finish Week blockers (`episode-publication.ts` duplicates it):
`Un-post Team Slaytopia before …`, `Team Slaytopia has 0 of 4 marks. Score
it or remove it before finishing the week.`, `Dance-Off 2 is already set up.
Reload and try again.`

One dance, several names: `Team Slaytopia` (SQL errors), `Team Dance ·
Slaytopia` (Results, member cards, couple history), `Slaytopia` (Night
Summary), `Dance-Off` vs `Dance-Off 1` vs `Immunity` vs `Dance-Off
Immunity`. The builders: `night-dance-lines.ts` `styleLabel`,
`results-form.tsx` (picker, member card, night summary), `home-activity.ts`,
`team-dances.ts` `automaticSpecialDanceName` / `specialDanceSummary`,
`episode-rounds.ts` `heatName`, SQL `special_dance_label` /
`round_heat_name`, `episode-publication.ts`.

## Couple history — 2026-11-05

Built: `/couples/[id]` (see CLAUDE.md "Couple history"), linked from Results
cards, Couples Leaderboard rows and Your Fantasy Roster. Browser-checked at
390/360px in a scratch league with writes blocked: caught up, Spoiler-Free
watched through Week 6 (Julia & Ezra read Still Dancing, Weeks 7–8 held
back) and as a guest (published weeks, no judge marks).

Next slices, in order:
- League context: In Your Leagues card and per-week pick lines done
  2026-11-06 (matching the Couples Leaderboard and Results' gold lines;
  browser-checked caught up, Spoiler-Free at Week 6 and as a co-manager).
- For Kylie after E10, one question: a roster timeline ("Pat Weeks 1–5 ·
  you Weeks 6–8") together with the holder spoiler it would expose. Today
  the holder (couple page and Standings' Couples Leaderboard) is the current
  (else latest) slot whatever the viewer has watched, so a Recast pickup
  after a Spoiler-Free viewer's cutoff names the new holder, hinting that
  someone's couple went home. Clamping to the slot active at the cutoff
  changes Couples Leaderboard numbers (a later pickup reads as an undrafted
  what-if). Fix both pages together, never one.
- More tap targets: done 2026-11-06 (Home Recent Activity, league cards,
  League at a Glance, Grand Finale brackets, Recast, the Eliminated banner),
  browser-checked except the Curtain Call glance list, the Grand Finale
  lists and the Recast claim sheet on Picks (the scratch league has no
  peers' picks, brackets or open slots). Left out: the draft room (a live,
  timed draft is the wrong place to leave, and its couples are buttons) and
  a Grand Finale peer's Next elim line (inside the row's button).
- Released drafts for viewers who unlocked them (Results doesn't show them
  either today).
- Not yet seen on a revealing night: the Posting Live week for a Stay
  Updated viewer.
- `notFound()` answers 200 because the route has a `loading.tsx` (streaming
  starts first); the not-found UI still shows.

## Episode rounds — 2026-11-05

Live: `apply-episode-rounds.sql` applied and verified (E09 Round 1 + Team
Dance with Wildcats and Slaytopia; E10 Round 1 + Dance-Off, 3 heats by
Winner's Bonus); app `5e904be` (UI pass `330143e`: app chips, type scale,
labels, neutral badges; rounds as underlined Tabs `5e904be`); types
regenerated. Render-checked at 390px
with a throwaway site admin and every write blocked: Enter Results' Rounds
switch, Round 1 card with its Dance-Off line, Mark an Exception panel,
Dance-Off tab (Winner's Bonus, heat picker, Not in This Round), Edit Episode
for E09 and E10 (pairings, checks, Add Round picker).

Kylie's click-through on production (2026-11-05): saving Edit Episode for E10
with Harry & Jenna marked Immune in the Dance-Off round, and seeing them under
Not in This Round with the Dance-Off Immunity row on Enter Results, all good.

Still to see with a real write (rehearsed in PGlite only):
- Setting the Winner's Bonus (E10 night), Undo on an exception, setting up a
  placeholder heat, a heat by Judges' Marks per couple.
- E10 night: the bonus filling Winner rows and the immune couple; Finish Week
  with the Dance-Off round.
- Schedule's save is two steps: the episode saves, then the plan; a refused
  plan (a heat with scores) shows its own message after the episode saved.
- Home now reads "Harry earned +3 with Dance-Off Immunity" for an immune
  bonus (the immunity row's name); not yet seen with a posted row.
- A Not Dancing exception on Round 1 only, on a night with a second own
  round, still maps the couple's rows by order (edge; no S35 night has two
  own rounds).
- Fallback: redeploying `b3ab890` works against this SQL while no heat is
  scored by Judges' Marks per couple.
- Done 2026-11-05: a special dance's Points rows keep the points box and
  Result picker on one line at 360px; the name wraps inside its own column
  (render-checked on E10's Dance-Off tab with writes blocked).
- The base-nova `Tabs` "line" variant (`src/components/ui/tabs.tsx`, CLI
  generated) pins the list to `h-8` and draws its underline 5px below the
  tab; the round tabs override both (`group-data-horizontal/tabs:h-auto`,
  `...:after:bottom-0`). Any other two-line or scrolling tab strip needs the
  same.

## Special dances follow-ups — 2026-11-04

All live on `main` (`885b87c`) with their SQL applied and verified:
- the page-held special-dance saves;
- whole marks 1–10 in one `JudgeScoreRow` (names shrink to fit one line, no
  guest marker);
- the night's judges, out of 10;
- special-dance draft release;
- Results scores under the total (`40 + 40`, a dance-off loser's 0 left out);
- struck-through eliminated couples on Home's Dance Card;
- Special Moments retired;
- contributor setup of special dances (an unpublished week, an unposted
  dance);
- trimmed setup fields: no Artist or Theme / Source; suggestions Captain,
  Host, Live Performer, Mentor and Winner, Loser, Immune.

Checked 2026-11-04:
- Every published episode but E02 still holds a correction seed (written
  seconds after publish, when Enter Results reopens the week), identical to
  its live own rows. Harmless: fans read drafts only for unpublished
  episodes, and Scores and Schedule show Published regardless.
- A couple's judge boxes stay disabled until the dance has a style (marks
  typed first were silently skipped by the draft save). Browser-checked on
  E10 at 360px with POSTs aborted.

Lineup and overtakes (2026-11-05), browser-checked in a scratch league:
- Spoiler gate browser-checked: a Spoiler-Free viewer with nothing watched
  sees neither the Results lineup nor the Picks dance lines.
- Special dances are not in the lineup yet (Kylie: fine, they show once
  posted).
- Overtakes are net per week, recomputed on load; a swap and swap-back
  within one night leaves no line. A true event feed would need a stored
  ledger (the settled "no persisted ledger" call for Score History).

Cleanups (2026-11-05):
- Done in the app: `TeamEntry` and the inferred-teams fallback are deleted
  (`TeamsMode` "inferred" is now "none"), and nothing reads `mark_max`,
  `panel_judge_ids`, `song_source`, `theme_label`, `songs[].artist` or the
  custom-moment tables.
- `supabase/apply-retire-special-leftovers.sql` applied live 2026-11-05 and
  verified: columns, custom-moment tables and `mutate_draft_moment` gone, all
  nine functions identical to the file with service-only grants, E10's
  snapshot reads; types regenerated.
- Dance styles checked 2026-11-05: E10's seven prefilled dances all use
  existing styles. A missing one (Charleston, Hustle, Lindy Hop) is added in
  Show Settings, no SQL.

Still to see on a real night (E10, Tuesday 2026-11-10, 8pm ET), none browser-checked:
- Special-dance card: a typed mark survives switching away and back; an
  invalid mark blocks Finish Week by name; Save as Draft Score → Drafted ·
  Withdraw; a released special shows on Home / Standings for viewers who
  chose Stay Updated, and its posted rows replace it.
- Home Dance Card strike on a roster with an eliminated couple (no test
  league has one; Kylie's real leagues do).
- A four-judge (guest) night's score row at 360px.
- A Stay Updated viewer's overtake lines on Home and the Results lineup card
  changing over the 20-second refreshes as couples post (the card gives way
  to scores once the first couple posts).
- Dance-offs as Points per Couple specials (one per heat, loser entered as
  0) and the immune couple's bonus as a one-couple Immunity special, created
  by a contributor on air. PGlite rehearses this; the page has not seen it.

Still to check:
- Known limit: when a draft week has a sibling night that is already
  published, draft-night standings replace that week's stored survival and
  Curtain Call points with the judges-only draft computation.

## E08 night follow-ups — 2026-10-27

- League Settings' "Lock Week N Picks Now?" dialog (`pickLockFlip` `lock_now`)
  is unit-tested but not seen in a browser. Check it on a league whose current
  week is still open.
- Home's picks-due check (`league-home-summary.ts`) ignores the second
  elimination slot, so a manager with one saved pick looks caught up after a
  week is flagged double. Kylie handled it by messaging managers; not changed.

## First-user QA pass — 2026-10-22

Three journeys at 375px against production data (`seed.mjs` QA-domain accounts,
swept afterwards): mobile creator on a throttled connection, invite-link newcomer,
breaker. Everything it found is fixed except:
- Kept as is: the league card's "Need Home & High picks". Home/High are the
  card's established Curtain Call labels (locked Home design), echoing "Who goes
  home?" / "Who scores highest?".
- Known, not changed: a mid-season league with Dance Card off keeps Anchor Week 1,
  so every manager's pre-placed Grand Finale couples really pay. It's the same for
  every manager, so standings aren't skewed; the commissioner can move the anchor.
- Slow-network timing (production build, ~400 kbps, 400 ms latency): Home shows
  content at 2.7s and finishes loading at 7.3s; later steps take 1–2.5s. No action.

## Audit remediation — 2026-10-20

The owner approved the recommended fixes after `682afc7`. Local implementation
and evidence: `docs/audit-remediation.md`. Release prerequisites and remaining
manual checks: `docs/audit-release-runbook.md`. This replaces the previous
wait-for-selection list; it does not mean every audit finding was implemented.

Still outstanding:
- Independent spoiler patch `ce6fc3d`: deployed and verified in production
  2026-10-20 (a throwaway account's Scores/Schedule payloads carry only draft
  summaries, with E07's drafted songs absent). The fail-closed profile read was
  covered only by unit tests; it can't be triggered on demand.
- Guest browsing `c6d73e4` (signed-out Home/Results, `/picks` and `/standings`
  sign-in cards): live and verified in production 2026-10-20. The anon grants
  (`apply-guest-browsing.sql`) are applied live. Merged into this branch in
  `e4f1764`. Kylie still needs to check it on her phone signed out.
- Curtain Call admin backfill `352e386` (League Settings → Curtain Call → Record
  a Pick, site admins only): live and verified in production 2026-10-20. Its
  additive SQL (`apply-curtain-call-backfill.sql`: the four provenance columns and
  `admin_backfill_prediction`) is applied live. `submit_prediction` still leaves
  provenance null until `apply-audit-prediction-provenance.sql` runs. Merged into
  this branch in `e5ffef5`.
- Decided 2026-10-21: keep `apply-audit-deadlines.sql`'s pause on late Grand
  Finale submits between a week's air time and its publish (CLAUDE.md Settled
  Decisions). It ships with the coordinated release; nothing to change.
- Fixed 2026-10-20 (`e2ca87f`, grants applied live by Kylie): League Settings for a
  site admin who isn't in the league now reads the season and deadlines
  (`apply-service-role-season-grants.sql`). Verified on production with a throwaway
  site admin in #supportSWEKylie: Missed the lock and Record a Pick both appear.
- Released 2026-10-22: the four audit scripts are live, the app is deployed from
  `997de1a` and types are regenerated (see CLAUDE.md). Still open from it:
  - Kylie approves Results Contributors at `/admin/accounts` before E08 (Oct 27);
    leagues no longer grant score-entry access. As of 2026-10-22 balla is approved.
  - Before E08's curtain, get the two open Grand Finale late entries (Jonathan Au,
    #supportSWEKylie, 80%; arielle, Carrie Ann's Biggest Fans, 100%) submitted or
    closed. The air-to-publish pause refuses their submits until E08 publishes.
  - Observe E08's publish, live reveal and undo (checklist: `docs/audit-release-runbook.md`
    → First live night after the release); also redo the missed E07
    re-check of Home/Results/Picks/Standings/switcher with a released draft and a
    live-revealed couple.
- Backups: a private pre-release dump exists on Kylie's Mac
  (`~/Backups/mirrorball-before-audit.dump`, Postgres 17.6, pg_dump 18.6). It has
  not been restore-tested (no spare Supabase project), and recurring backups
  aren't scheduled.
- Configure custom SMTP before enabling confirmation/recovery/email changes.
  No emails sent. Existing account ownership needs factual review, not resets.
- Confirm intended historical backfills (DATA-8); no deletion/recompute authorized.
- Review public repository visibility and install a review gate if desired;
  neither repository visibility nor personal tooling settings changed here.
- Physical iOS, live Realtime, cross-device auth and staging migration smoke tests.
- West-coast policy, current scoring exemptions and historical corrections remain
  intentional; broader ownership-history UX questions remain deferred.

## UX audit follow-ups — 2026-10-18

Full findings and fix status: `docs/ux-audit.md` (Status section at the top). Shipped and deployed through `d4f20d0`.

**Still open:**
- **Email recovery/ownership (A1):** confirmation-aware signup, token-hash recovery,
  disabled email-change UI and retained auth form values are implemented locally.
  Delivery remains disabled without custom SMTP. Use the audit release runbook's
  templates and controlled-account checks before activation.
- **Auth retry/continuation (A2):** local controlled forms retain email/name and
  invitation continuation after errors; browser checks use mocked actions.
  Google/native callbacks still require live-account and physical-device checks.
- **Phone checks:**
  - Enter Results' per-couple row now uses standard-size buttons. Only a super admin sees Publish, so Kylie should look at it.
  - The auto-opened Scores Are Going Live sheet shows a focus ring on the title's ⓘ (headless only?).
  - The new touch hit areas (taps just outside small buttons).
- **Remaining audit items:**
  - A5 auth identity;
  - V3 disabled-button contrast;
  - V4 tiny text;
  - T2 bottom-sheet safe area / max-height;
  - T3 draft-room tooltips;
  - N1 duplicate Settings menu and mixed ×/‹ Back patterns;
  - C3 jargon ("Account-Wide", "Hard Deadline", "players").
- **Enter Results drops a pending autosave when the page unmounts** (`results-form.tsx`, the unmount effect only `clearTimeout`s the 1.5s timer). Typing a score and leaving within 1.5s loses that edit; leaving for Home already does this, because Home's skeleton unmounts the page at once. Fix after E07, as its own deploy: flush the pending draft on unmount (or on `pagehide`) instead of cancelling it. Once fixed, admin can get the same `PageSkeleton` as the other pages (left out of S2 for this reason).
- **Conflicts with settled decisions** (pull-to-refresh disabled, middle-dot/all-caps/→ conventions): listed in the audit for Kylie to decide; nothing to build unless she asks.
- **`npm test` (`vitest run`) also picks up 8 broken test files under the gitignored `.codex-private/`** (another tool's folder). All app tests pass. Excluding them in the vitest config is an option if Kylie wants it; it hasn't been asked for.

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
3. **League-switcher summaries off the Picks/Standings critical path — done and pushed to main in `91d789d`** (deployment not yet confirmed). `loadLeaguePageBase` no longer runs `computeLeagueHomeSummary` for other leagues; the switcher sheet calls `getSwitcherSummaries` (`src/app/leagues/[id]/switcher/actions.ts`) on every open, which goes through `loadHomeLeagueData`, so each row follows Home's rule (this also settles the "switcher rank ≠ Home rank on a live night" flag below). Verified 2026-10-14 with a scratch viewer in three leagues: rows (name, "Rank N of M", Picks Due) identical before/after and equal to Home's cards; Picks median ~2.5s → ~2.1s (n=4 each, dev mode). The first version showed "Loading…" for about 1s on open; the switcher now also fetches once after mount (and again on each open, keeping the old rows meanwhile), so the sheet is ready when opened and a tab tap right after load wasn't measurably slower (n=4, ~1.7s either way). **Wrong-league attachment checked 2026-10-15** (production build, scratch viewer in three leagues, a Curtain Call pick and Grand Finale bracket submitted in one extra league only): that row alone read "All caught up" while the others read "Picks Due", with the same result from all three leagues' switchers and matching Home's cards. Not verified: a live night with a revealing week or released drafts (E07). `loadOtherLeaguePicks` (2026-10-15) now loads the other leagues' picks in the same round as their module settings and only then calls the per-league lock/deadline RPCs, so it is two rounds instead of three or four; the RPCs themselves stay per league (each league has its own lock). Picks HTML identical before/after for a scratch viewer in three leagues (one with picks, one without).

Ride-along flags (behavior questions, not perf, so decide separately):
- **(Resolved by #3: the switcher follows Home.) Switcher rank ≠ Home rank on a live night.** `loadLeaguePageBase` passes `cutoff.allowedEpisodeIds` to `computeLeagueHomeSummary` but not `scoredIds`/`revealingWeekId`/`draftNight`, which Home passes. Decide whether to align before or with #3.
- **(Fixed 2026-10-15.) Home refreshed in more cases than the other pages.** Home's `RevealAutoRefresh` used `active={!!revealing}`, so a viewer who hadn't opted in kept refreshing after the live window while live-revealed, unpublished scores remained. It is now `!!revealing && revealingVisible`, as on Results and the league pages and as CLAUDE.md already described. During East/West the clock windows still refresh every page, so the live-air prompt and posting strip appear on their own; the only change is a gated viewer's strip count going stale after the window until a reload.
- **(Fixed 2026-10-15.) Refreshes could overlap on slow renders.** `RevealAutoRefresh` now runs `router.refresh()` in a transition and clears its timer while a refresh is in flight (windows are read through a ref), so a slow render is never overlapped; the cadence is still 20s after each refresh completes. Verified against a temporary page with a 4s render and a faked clock: old component fired a second request while one was pending, new one fires none and resumes on the next tick. Production build, `eslint src`, tsc and 609 tests pass.
- **(Partly fixed 2026-10-15.) League pages re-read data they already have.** The draft-night manager scores no longer re-query `scoring_settings`/`roster_slots` in a serial round: the base loads the league's roster slots unconditionally in its first stage and `draftManagerScoresForNight` (pure, in `draft-scores.ts`, tested) uses them. The recast page's separate current-roster query is now derived from the base slots (slots only exist once the draft completes, so it is equivalent). The viewer's own current seats (Recast) now come from the same base rows too, via `rosterSlotPeriods` (every held slot with its number, ungated by whether roster cards show, since the Recast card depends only on waivers being on); that removes the last separate `roster_slots` read on Picks. Verified identical Picks HTML on old and new builds with a scratch viewer holding an eliminated couple in a waivers league (open spot, available couples).
- **(Fixed 2026-10-15.) `getUser()` ran up to three times per render.** `getAuthUser` (`src/lib/supabase/server.ts`, `React.cache`) is now the one Auth round trip for `SiteHeader`, Home, Results, Manage Leagues and `loadLeaguePageBase`. Middleware keeps its own call (it refreshes the cookie). Other pages still call `auth.getUser()` directly.
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
7. **(Decided 2026-10-16: leave it.) Settings "I last watched" mid-East.** Moving it to the current week calls `unlock_draft_scores_through`, the same call East Stay Updated makes, so it reaches no state Stay Updated doesn't. The prompt's gray Mark Watched is about honest copy ("I've Finished It"), not a draft gate. No picker lock.
8. **Check the install/speed/frame pass on a real phone and laptop** (`edfef79`, `1e24dfd`, `28ce2da`): confirm the Vercel deploy is Ready; remove and re-add the home-screen shortcut to see the new icon (iPhone caches the old one); tap each fan tab and confirm the skeleton paints at once; on a laptop confirm the tab bar, the Enter Results sticky Publish bar and bottom sheets stay inside the 30rem column; check the 20px top-bar glyph reads at that size. Nothing was timed, so also measure real page load before claiming a speedup. Add the touch pass (`polish/native-touch-css`, `217e4ee`) to the same phone check — Chromium can't show any of it: taps give instant pressed feedback on list rows and nav icons (no 300ms-ish zoom wait), no rubber-band past the frame edges and no pull-to-refresh, the Spoiler-Free strip pill and the draft-scores "i" are comfortably hittable with a thumb, and the sticky top bar stays pinned while scrolling each tab with no strip showing (no gap or double bar under the iOS safe area). Follow-ups the user hasn't asked for: the native iOS app icon still comes from the old purple `assets/icon.png` (touches the in-progress Xcode project); the logo pack's wordmark and stacked splash are unused and unlocked; a first-run tips overlay was offered and declined for now; the duplicate `getUser()` calls (middleware, `SiteHeader`, page) were left in place.

## Built but not checked in a browser or on a real episode (needs a phone, or Tuesday's episode)

Everything below is committed and pushed (`49c0887`, `afe8716`, `72934f2`, `60435fa`), passes `tsc`, `eslint src`, 441 tests and `npm run build`, and was never seen running: the container has no browser, and the states depend on the episode clock or on scores posting. Next real episode: Tuesday 2026-09-29, 8pm ET / 5pm PT (West feed 11pm ET / 8pm PT).

- **Home curtain** (`episode-banner.tsx`, copy in `statusCopy`). Only one chip state has been seen on a phone. Check each of the seven states (Picks Open, Picks Locked, On Air Now, Hold the Curtain, West Coast "Let's Dance", Results Soon, Scores Are In): the `Week N · {chip}` fits on one line beside the live dot (C and G), the curtain (min `h-40`, grows with wrapping text) holds a two-line title ("Hold the Curtain", 💃Let's Dance🕺), the sub's viewer-local time reads "Today 5 PM PT" style, and the seven-node rail's NOW/NEXT label sits correctly (A, B, F, E = NEXT; C, D, G = NOW; D stays on the current week). **Time-mocked dry run done 2026-10-16** (temporary fixture route, pinned browser clock, 360/390px, ET and PT viewers): all ten states (the seven plus On Air with picks still open and Curtain Call off for Picks Open/On Air) show the right chip, title, sub and NOW/NEXT marker; the Live (ET)/(PT) dot sits on the chip line. Fixed from it: Hold the Curtain's "West Coast Showtime · Today 8 PM PT" stranded "PT" on its own line at both widths; the time now stays in one piece and wraps after the dot. Still a phone check. Picks Locked is only reachable when a league sets a lock lead above 0 hours, or on Night 2. Curtain Call off swaps in "Curtain Up Soon" / "Time to Vote" copy (unseen).
- **Live-night chrome dry run (2026-10-16, Home only, fixture inputs, headless Chromium):** posting (Spoiler-Free on/off, East, gap, West), ready (one and three weeks behind, incl. Choose an Earlier Week), watching, draft-available, the amber draft strip and its info sheet, and Scores Are Going Live (East Spoiler-Free on/off, West, pill-opened with no chip in the gap) all render as specified with no console errors. Open from it: (1) the auto-opened prompt shows a focus ring around the title's ⓘ (not when a pill opens it); check on a phone, may be headless-only. (2) At 360px a very long draft label ("Christopher & Alexandria M. · 11/12") truncates the N/M count; no Season 35 pair is that long (longest "Guillermo & Witney"). Not covered: the strip/prompt on Results/Picks/Standings, sticky stack on scroll, and the server choosing which strip/prompt to show (unit tests only).
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
- **Team Dance / Special Dances:** the Score a Team Dance sheet is gone. Week 8 (Disney Night) already uses the team-entity path (`apply-team-dance-entity.sql` and `cleanup-disney-night-slot2.sql` are live). `supabase/apply-special-dances.sql` is written and PGlite-tested but **not applied live**; until it is, Enter Results stays on the entity path (existing teams are scoreable, no inline Add / Edit Details). After apply: Special Dances picker group, inline setup, Points mode, and Fantasy Bonus (pts). Check a real night after the SQL runs. Do not rerun the Disney Night cleanup.

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

## Roster Moves card and pages — 2026-11-11

- Built from `docs/design/roster-moves-pages/` (card C1 and the page frame; Kylie's picks are in its README). Saving a waiver claim from the Wire's Claim sheet was verified in the 2026-11-11 scratch-league test (see Lifeline, Recast and Trades above).
- The fact strip's times wrap to two lines in the container's UTC; on a phone (PT/ET) they should fit. Look once on Kylie's phone.
