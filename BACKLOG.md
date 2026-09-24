# Backlog — to be dealt with later

Things explicitly deferred during development, not tracked anywhere else. Not a full feature roadmap — just the "don't forget this" list.

## Results / Picks week carousel

Shared slim ← `Week N — {theme}` → control (`EpisodeCarousel` / `formatEpisodeCasualWithTheme`). Not on Home. `?week=` is `competition_weeks.id`. Multi-episode weeks may show a subtle `Night One + Night Two` under the label.

- **Results** (`/this-week`): prev/next are `/this-week?week=` links. Carousel weeks = spoiler-visible completed **weeks** **plus** upcoming/locked for a theme peek. Unwatched completed weeks are omitted so `?week=` cannot leak results. Completed + visible → results; upcoming/locked → theme peek. Default is the latest visible completed week; before premiere, the first peek week. Pending reveal stays `WeeklyResultsView`'s mark-as-watched card. A week is complete only when every assigned TV episode is complete.
- **Picks / Curtain Call**: one card (`CurtainCallCard`), titled **Curtain Call**. Same carousel; hrefs are `?tab=yourpicks&week=`. Live/upcoming week → pick form. Completed week → past recap in that same card. Unwatched completed weeks land on the lock card. No second Past picks card.

Out of scope (still): full season schedule dump, a new schedule page, lock-time hint, Home timeline.

## Bottom nav width + sticky desktop

Implemented (PR #18) — fan and admin tab bars stay `fixed` to the viewport bottom on every width (same as phone) and span the `max-w-2xl` content column. Shared wrapper: `BottomNav` / `FanBottomNav` in `src/components/bottom-nav.tsx`. Surfaces: Home (`/today`), Results (`/this-week`), league tabs (`LeagueTabs`), admin (`AdminResultsTabs`).

Out of scope (still): redesigning icons/labels.

## View Results / layout polish

### Episode dropdown on the title line

**Superseded by EpisodeCarousel** (PR #17). Fan Results no longer uses `WeekSwitcher` above the theme — the slim ← `Week N — {theme}` → control sits under the Results title (`PageHeader` children on `/this-week`). The original nit (dropdown sitting *above* the episode title; wanted same-line, right-aligned) applied to that WeekSwitcher chrome and is gone. Picks uses the same carousel inside the Curtain Call card.

Admin View Results is accordion-by-week (nested S35 E0x on multi-night weeks) and has no episode dropdown. Admin Enter Results' Week `Select` is form chrome under the card title, not the fan switcher — not parked.

### DND / "—" display (live check still owed)

Code already maps `episode_results.outcome = 'bye'` → badge **DND**, pts **—** on Admin View Results (by week and by couple) and public Results (`/this-week`). Still needs a real published Did Not Dance couple to confirm on those surfaces. Do not invent a fake production row.

## Past picks vs results (Picks)

Implemented on the league **Picks** tab (`?tab=yourpicks`), inside the single Curtain Call card (not a second card, not a new tab).

- Episode switcher is the shared slim `EpisodeCarousel` (`?tab=yourpicks&week=`). Fan labels: `formatEpisodeCasualWithTheme` (`Week N — {theme}`), not `formatEpisodeLabel`. Card title is **Curtain Call**.
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

## Appearance / overall aesthetic redesign

The app currently has one deliberate fixed look (dark ballroom + gold, from the Phase 8 design pass) — no light/dark toggle is wanted. But there's appetite to redo the *whole* theme and visual aesthetic at some point, not just tweak it. Explicitly pushed to later rather than done alongside the Settings placeholder work.

## Account-nav follow-up edits

Settings sheet order A shipped: Profile, Spoiler-Free, Notifications, Add to Home Screen, Appearance (coming soon), Account & data. Site Admin and Sign out stay below. No further account-nav edits currently queued.

## Scoring calibration follow-ups

- **Lock `judges_score_multiplier` with the other scoring settings** (wanted, not built). It's excluded from the Grand Finale-deadline lock in `update_scoring_categories` on purpose: `start_draft` calibrates it by roster size, and drafts often run after that deadline, so a plain lock would stop a commissioner adjusting it before a late draft. Needs a rule first, e.g. "locked once the draft is complete and the deadline has passed."
- **Dance Card ~25% calibration overshoot** — known; needs a product conversation before any fix, not a quiet patch.
- **Full Monte Carlo recalibration against real Season 35 data** — blocked on live SQL / `SUPABASE_ACCESS_TOKEN`, and the season isn't over. Re-running `scripts/monte-carlo-calibration/` already bakes in `POINT_SCALE`.
- **Equal-EV / neutral fair scoring defaults** — parked behind Enter Results UX polish.

## Draft order editing placement

`draft_type` lives in League Settings' Dance Card card, but the actual order (reorder list + `CustomDraftOrderCard`'s per-round grid) only lives in the draft lobby (`draft-room.tsx`) — two hops for a one-time setup decision. Designed, not built; not urgent since all drafts have run. Design: move order editing (commissioner-only) into `league-modules-form.tsx` next to `draft_type`, keep a **read-only** mirror in the lobby so managers can still build their auto-draft queue, leave queue/autopilot in the lobby. The wrinkle: the lobby effects that guarantee an order exists before `start_draft` can't move wholesale, or nothing forces a commissioner to open Settings first — resolve by moving the membership-reconcile effects into the new Settings component plus a defensive reconcile inside `handleStartDraft`. No SQL needed; `set_draft_order`/`set_custom_draft_order` are already commissioner + `not_started`-gated server-side.

## Standings Score History

Shipped: per-manager Score History that expands in place under each leaderboard row, plus a redesigned Standings tab with a Couples Leaderboard section (see CLAUDE.md). Design pack: `docs/design/standings-score-history/`. Earlier "points breakdown" concepts (rules sheets, expandable rows, weekly ledger) were rejected.

- **Container:** each leaderboard row expands in place into a compact fixed-height (`h-72`) scrolling panel; several can be open at once. Kylie is also sending mockups for a clearer tap affordance on leaderboard rows.
- Live check still owed on real published data (after republishing Week 1 so its Grand Finale credits refresh): own + peer panels, filters, sticky totals vs Standings, Spoiler-Free clamping, a weight ≠ 1 league.

## Scoring display follow-ups

- Stored `weekly_manager_scores` rows written before the 2-decimal rounding change stay whole numbers until the next results publish recomputes them; no backfill was done.
- Scores > By Week now hides unscheduled nights via `episode_participants`, but the fan-facing `/this-week` view (`weekly-results-view.tsx`) was deliberately not changed; it merges a week's nights per couple, so it looks unaffected. Confirm on real split-night data.
- The League at a Glance design pack's mocks show a "You" row at the top of the Curtain Call and Grand Finale peer lists; not built. The mocks live on branch `origin/cursor/league-at-a-glance-assets-233e` (`docs/design/league-at-a-glance/`).
- The draft-complete screen ("Draft complete!", roster card with "Not Drafted") has no entry point in the UI; it is only reachable at `/leagues/<id>/draft` for a league whose draft is completed. Not manually verified after the Dance Cards `unrostered` prop change.

## Grand Finale / Dance Card review items

- Weeks published before the Grand Finale scoring change need a republish to correct their points (unverified: all leagues' `weekly_manager_scores` were recomputed 2026-09-23 ~22:26, likely after `03523ee`, but that was not confirmed).
- Double elimination in the top five gives both couples the lower placement's 4th/5th bonus; review before the finale.

## Home curtain banner follow-ups

Shipped: new state machine, West overlays, relative "Airs", `episodes.duration_minutes`. See CLAUDE.md. Still worth deciding or checking:

- **Multi-night lock wording**: Curtain Call locks per week (first night minus lock hours), so Night 2 reads "Picks open · Picks locked · Airs Night 2" rather than plain "Picks open". Flip it if that reads wrong.
- **Live check** on a real episode night: the lock, on-air, West-feed and 10pm PT transitions, and the Results in hold, have only unit tests behind them.
- **Locked-state gap**: the lock transition happens outside the per-minute window when the lock is more than 6 hours before air, so it updates on the daily tick or next page load.
- Couples Leaderboard is a fixed `h-96` scroller; revisit if the cast is small enough that it looks empty.

## Housekeeping

- Full `npm run build` is still owed (last one predates League at a Glance, Score History and the Couples Leaderboard / Home banner work); needs the dev server on port 3000 stopped first.
- Decide whether to delete `claude/grand-finale-picks-feedback-brief.md` (stale brief for a dropped design) and `scratch/recovered-docs/` (recovered pre-cut CLAUDE.md/handoff copies).
- The user said "these are separate pages now" about Scores / Enter Results, but the repo still uses one page (`/admin/results`) with `?tab=`.

## Parked nits

- **Enter Results UX polish** — top product backlog item. PR #32 was left open as a draft, queuing notes only.
- `addTeamDance`/`TeamDanceSheetContent` ("Score a Team Dance") is under-named now that Trio Dance is also a round type — it's a generic same-dance/multi-couple bulk entry. Cosmetic rename, not urgent.
- In Jeopardy: mid-season backfill of marks, and a commissioner-facing "did anyone get In Jeopardy credit?" glance on publish. Both optional.
- Dead `'You are not a member of this league'` branch in `set_custom_draft_order` (`supabase/schema.sql`) — unreachable, never cleaned up.
- League Settings' "✓ Settings saved" banner (`league-modules-form.tsx`) doesn't clear when you edit again.
- A human click-through of the custom-draft lobby UI was never done.

## Known scoring/data limitations (not bugs, just scoped-out edge cases)

- **Grand Finale late-deadline gap** (Phase B): if a commissioner sets the Grand Finale deadline later than the default (i.e. after some eliminations have already happened), a prediction submitted at that point won't retroactively score the already-resolved couples — only couples resolved *after* submission score. Never comes up with the default deadline (premiere date), since nothing's eliminated yet at that point.
- **Home/Weekly category-breakdown weighting** (Phase C): the "points by category" breakdown sums each manager's raw per-category points across the season, then multiplies by *current* module weights — not the weight that was actually in effect each week. If a commissioner changes a module's weight mid-season, past weeks' breakdown reflects the new weight, not what was live at the time. Matches an existing, already-accepted limitation elsewhere (weight changes were never retroactive to begin with).

## Possible future enhancement (not requested, just scoped out)

- **Avatar upload** for Profile — display name editing shipped; avatar upload would need a Supabase Storage bucket set up from scratch, which doesn't exist yet.
