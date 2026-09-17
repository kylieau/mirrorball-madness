# Backlog — to be dealt with later

Things explicitly deferred during development, not tracked anywhere else. Not a full feature roadmap — just the "don't forget this" list.

## Home season strip (`/today`)

Implemented at the **top of Home** (`/today`), season-scoped via `active_season_id()`, **not** per-league. Not on each league card.

- Small card/strip — **Just aired** (latest completed) and **Up next** (next non-completed, including `locked`). Fan labels: `formatEpisodeCasualWithTheme` (`Ep. N — {theme}`) plus `episodes.airs_at` as the show-night date (US Eastern). Not `formatEpisodeLabel`.
- Whole strip taps to This Week (`/this-week`).
- Spoiler-Free: theme and air date only. Results/scores/who went home stay on This Week behind `resolveSpoilerCutoff`. Pending reveal remains `SpoilerRevealCallout` — the strip does not duplicate it.

Out of scope (still): full season schedule dump, a new schedule page, lock-time hint on **Up next**.

## Past picks vs results (Your Picks)

Implemented on the league **Your Picks** tab (`?tab=yourpicks`), below the current-week Curtain Call form. Not a new Results tab.

- Episode switcher reuses This Week's `WeekSwitcher` (`?tab=yourpicks&week=`). Fan labels: `formatEpisodeCasualShort` / `formatEpisodeCasualWithTheme` (`Ep. N`), not `formatEpisodeLabel`.
- Per completed episode: your elim pick(s) vs actual, top-scorer pick vs highest `dance_scores.total_score` sum (same helper scoring uses), Curtain Call points from `weekly_manager_scores.prediction_points`.
- Spoiler-Free: outcomes only for weeks in `resolveSpoilerCutoff` / `allowedEpisodeIds`. Unwatched completed weeks are selectable but locked (“Mark as watched to see how you did”) — no results leak.
- v1 is **your** history only. Hidden when Curtain Call is off.

Out of scope (still): spectator role, league-wide miss-rate board, bottom-two / “almost had it”.

## Account deletion processing

`request_account_deletion` records a request (`profiles.deletion_requested_at`) but nothing surfaces the list of pending requests anywhere. Needs at minimum a way to query it (a Supabase dashboard SQL query is fine for now, given the scale); eventually a small admin view if this ever needs to happen regularly.

## Notifications

Currently in-app only (`/notifications`, reusing the same "picks needed" logic as Today) — deliberately scoped that way for v1. Real delivery (email and/or push) is still an open question: no transactional email provider or push setup exists in this project yet. Revisit once there's a clearer sense of what actually needs to reach someone outside the app.

The Add to Home Screen / enable-notifications *how-to* is a top-level Settings row (`/settings/add-to-home-screen`), not nested under Notifications and not on Home. It is UX guidance only — no FCM/APNs, no service worker, no subscribe button. iOS vs Android steps are adapted from LA Home Wins, not a first-visit modal.

(Kylie's own note from when this came up, in case it jogs something later: "see LA Home Wins.")

**Notifications-as-dialog, deferred**: when Account Settings became a Sheet with Profile and Account & data converted to nested dialogs (see `scratch/league-settings-relocation-plan.md`), Notifications stayed a plain full page rather than also becoming a nested dialog — it's a scrollable content list (picks-due per league), not a settings form, so cramming it into a dialog wasn't an obvious win. Revisit if it turns out to matter.

## Appearance / overall aesthetic redesign

The app currently has one deliberate fixed look (dark ballroom + gold, from the Phase 8 design pass) — no light/dark toggle is wanted. But there's appetite to redo the *whole* theme and visual aesthetic at some point, not just tweak it. Explicitly pushed to later rather than done alongside the Settings placeholder work.

## Account-nav follow-up edits

After the Today/Leagues/Settings navigation shipped, there are edits wanted on that end — not yet articulated. Revisit once those thoughts are sorted.

## Known scoring/data limitations (not bugs, just scoped-out edge cases)

- **Grand Finale late-deadline gap** (Phase B): if a commissioner sets the Grand Finale deadline later than the default (i.e. after some eliminations have already happened), a prediction submitted at that point won't retroactively score the already-resolved couples — only couples resolved *after* submission score. Never comes up with the default deadline (premiere date), since nothing's eliminated yet at that point.
- **Home/Weekly category-breakdown weighting** (Phase C): the "points by category" breakdown sums each manager's raw per-category points across the season, then multiplies by *current* module weights — not the weight that was actually in effect each week. If a commissioner changes a module's weight mid-season, past weeks' breakdown reflects the new weight, not what was live at the time. Matches an existing, already-accepted limitation elsewhere (weight changes were never retroactive to begin with).

## Possible future enhancement (not requested, just scoped out)

- **Avatar upload** for Profile — display name editing shipped; avatar upload would need a Supabase Storage bucket set up from scratch, which doesn't exist yet.
