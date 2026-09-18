# Backlog — to be dealt with later

Things explicitly deferred during development, not tracked anywhere else. Not a full feature roadmap — just the "don't forget this" list.

## Results / Picks episode carousel

Shared slim ← `Ep. N — {theme}` → control (`EpisodeCarousel` / `formatEpisodeCasualWithTheme`). Not on Home.

- **Results** (`/this-week`): prev/next are `/this-week?week=` links. Carousel weeks = spoiler-visible completed episodes **plus** upcoming/locked for a theme peek. Unwatched completed weeks are omitted so `?week=` cannot leak results. Completed + visible → results; upcoming/locked → theme peek. Default is the latest visible completed week; before premiere, the first peek week. Pending reveal stays `WeeklyResultsView`'s mark-as-watched card.
- **Picks / Curtain Call**: one card (`CurtainCallCard`), titled **Curtain Call**. Same carousel; hrefs are `?tab=yourpicks&week=`. Live/upcoming week → pick form. Completed week → past recap in that same card. Unwatched completed weeks land on the lock card. No second Past picks card.

Out of scope (still): full season schedule dump, a new schedule page, lock-time hint, Home timeline.

## Bottom nav width + sticky desktop

Implemented (PR #18) — fan and admin tab bars stay `fixed` to the viewport bottom on every width (same as phone) and span the `max-w-2xl` content column. Shared wrapper: `BottomNav` / `FanBottomNav` in `src/components/bottom-nav.tsx`. Surfaces: Home (`/today`), Results (`/this-week`), league tabs (`LeagueTabs`), admin (`AdminResultsTabs`).

Out of scope (still): redesigning icons/labels.

## View Results / layout polish

### Episode dropdown on the title line

**Superseded by EpisodeCarousel** (PR #17). Fan Results no longer uses `WeekSwitcher` above the theme — the slim ← `Ep. N — {theme}` → control sits under the Results title (`PageHeader` children on `/this-week`). The original nit (dropdown sitting *above* the episode title; wanted same-line, right-aligned) applied to that WeekSwitcher chrome and is gone. Picks uses the same carousel inside the Curtain Call card.

Admin View Results is accordion-by-week and has no episode dropdown. Admin Enter Results' "Scheduled Episode" `Select` is form chrome under the card title, not the fan switcher — not parked.

### DND / "—" display (live check still owed)

Code already maps `episode_results.outcome = 'bye'` → badge **DND**, pts **—** on Admin View Results (by week and by couple) and public Results (`/this-week`). Still needs a real published Did Not Dance couple to confirm on those surfaces. Do not invent a fake production row.

## Past picks vs results (Picks)

Implemented on the league **Picks** tab (`?tab=yourpicks`), inside the single Curtain Call card (not a second card, not a new tab).

- Episode switcher is the shared slim `EpisodeCarousel` (`?tab=yourpicks&week=`). Fan labels: `formatEpisodeCasualWithTheme` (`Ep. N — {theme}`), not `formatEpisodeLabel`. Card title is **Curtain Call**.
- Per completed episode: your elim pick(s) vs actual, top-scorer pick vs highest `dance_scores.total_score` sum (same helper scoring uses), Curtain Call points from `weekly_manager_scores.prediction_points`.
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

## Account deletion processing

v1 queue shipped. Super-admins (`profiles.is_super_admin` only — not `RESULTS_ENTRY_OPEN_TO_ALL`) see pending `deletion_requested_at` rows at `/admin/accounts` (email, display name, requested-at, user id) and can **clear a request**. Clearing does not delete the auth user or league history. Dashboard one-off: [supabase/queries/pending-account-deletions.sql](supabase/queries/pending-account-deletions.sql).

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

## Known scoring/data limitations (not bugs, just scoped-out edge cases)

- **Grand Finale late-deadline gap** (Phase B): if a commissioner sets the Grand Finale deadline later than the default (i.e. after some eliminations have already happened), a prediction submitted at that point won't retroactively score the already-resolved couples — only couples resolved *after* submission score. Never comes up with the default deadline (premiere date), since nothing's eliminated yet at that point.
- **Home/Weekly category-breakdown weighting** (Phase C): the "points by category" breakdown sums each manager's raw per-category points across the season, then multiplies by *current* module weights — not the weight that was actually in effect each week. If a commissioner changes a module's weight mid-season, past weeks' breakdown reflects the new weight, not what was live at the time. Matches an existing, already-accepted limitation elsewhere (weight changes were never retroactive to begin with).

## Possible future enhancement (not requested, just scoped out)

- **Avatar upload** for Profile — display name editing shipped; avatar upload would need a Supabase Storage bucket set up from scratch, which doesn't exist yet.
