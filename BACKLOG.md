# Backlog — to be dealt with later

Things explicitly deferred during development, not tracked anywhere else. Not a full feature roadmap — just the "don't forget this" list.

## Home season strip (`/today`)

Owner-approved, not started — do not implement UI/code until this is picked up. Lives at the **top of Home** (`/today`), season-scoped via `active_season_id()`, **not** per-league. Do not add it onto each league card.

**Priority:** after Curtain Call couple dropdowns (PR #13) and the spoiler Mark-as-watched fix (PR #9 / live pain).

**Shape:**

- Small card/strip, not a schedule dump. Admin Schedule owns the full season list; Home only shows:
  - **Just aired** — latest completed episode: casual `Ep. N — {theme}` + air date
  - **Up next** — next upcoming episode: `Ep. N — {theme}` + air date
- Use the fan helpers in `src/lib/format-week.ts` (`formatEpisodeCasualWithTheme` / `formatEpisodeCasualShort`) — not `formatEpisodeLabel` (`S35 E02`). Theme is `episodes.theme`; air date is `episodes.airs_at`.
- Tap → This Week (`/this-week`) in v1. A light schedule-detail destination can come later; don't invent a third nav surface now.
- Optional lock-time hint on **Up next** is later polish, not v1.
- Spoiler-Free: same gate spirit as This Week (`resolveSpoilerCutoff` / `last_watched_week`). Do **not** leak results, scores, or who went home for weeks the viewer hasn't marked watched. Theme and air date are OK to show, **or** keep **Just aired** vague until marked watched (Home already has `SpoilerRevealCallout` for that pending-reveal state — don't fight it or duplicate a results leak). Reuse the existing cutoff; don't bypass it.

**Explicitly out of scope for this item:** implementing the feature from this note, dumping the full season schedule on Home, a new schedule page, lock-time hint (later).

## Past picks vs results (Your Picks)

Owner-approved, not started — do not implement UI/code until this is picked up. Lives on the league **Your Picks** tab (`?tab=yourpicks`), not a new Results tab.

**Priority:** after the spoiler Mark-as-watched fix (PR #9 / live pain); ahead of a spectator role, as an engagement feature.

**Shape:**

- Keep the current week's Curtain Call form (`PickEmBox`) on top.
- Below it (or via a switcher): **Past picks** — how *your* Curtain Call picks lined up against what happened.
- Prefer an **episode switcher** (week/episode picker) to move between completed episodes — same mental model as This Week's `WeekSwitcher`; don't invent a second navigation paradigm. Labels should use `formatEpisodeLabel`.
- Per selected completed episode, compact card/row:
  - Your elim pick(s) → actual eliminated (✓/✗)
  - Your top-scorer pick → actual top judge-total couple (✓/✗)
  - Curtain Call points that week from existing `weekly_manager_scores.prediction_points` — don't recompute a second truth
- Spoiler-Free: only show outcomes for weeks ≤ `last_watched_week`; unwatched weeks locked ("Mark as watched to see how you did") — no leaking unpublished-to-viewer results. Reuse the existing cutoff (`resolveSpoilerCutoff` / `allowedEpisodeIds`), don't bypass it.
- v1 is **your** history only — no league-wide miss-rate leaderboard.
- Skip "almost had it" / bottom-two nuance for v1.

**Explicitly out of scope for this item:** implementing the feature from this note, spectator role, a separate Results tab.

## View Results / This Week layout polish

Owner-noted, not started — do not implement UI/code until this is picked up. Fan This Week (`/this-week`), Admin View Results, and shared chrome those pages share with Home / Your Picks. Grouped here so phone/iOS and web/desktop-width layout nits don't scatter.

### Episode dropdown on the title line

Kylie (via Chief Kimo): she doesn't like the episode dropdown selector sitting *above* the episode title. Move it to the **same line as the title, right-aligned**.

**Symptom:** chevron/switcher sits above the episode theme line (e.g. "— Premiere: Night Two…"). On This Week, `WeekSwitcher` is `PageHeader` children — stacked under the "This Week" heading and gold rule — then `WeeklyResultsView` renders `formatEpisodeCasualWithTheme` as its own line.

**Reference UX:** Curtain Call's **Past picks** card on the league Your Picks tab (`?tab=yourpicks`) — title left, `WeekSwitcher` in `CardAction` right. That layout is the model. Do not treat this item as implementing Past picks (that's the section above; still not started on `main` until that PR lands).

Do not change `PageHeader`'s league-switcher slot on Your Picks / Standings as part of this.

### Sticky bottom nav (web)

Kylie (via Chief Kimo): on Mirrorball Madness **web/desktop-width**, the bottom nav should **stick to the bottom consistently across pages**, regardless of window size — like the iOS/phone view (always bottom). She doesn't like it flipping top/bottom on different pages.

Owner-noted, not started — do not implement from this note.

Today the tab bars use `fixed … bottom-0` on small viewports and `sm:static` from the `sm` breakpoint up (`today/page.tsx`, `this-week/page.tsx`, `league-tabs.tsx`, `admin-results-tabs.tsx`). Static placement follows DOM order, so Admin's bar sits under the header (top) while Home / This Week's sit after the page content (bottom).

### DND / "—" display (live check still owed)

Code already maps `episode_results.outcome = 'bye'` → badge **DND**, pts **—** on Admin View Results (by week and by couple) and public This Week. Still needs a real published Did Not Dance couple to confirm on those surfaces. Do not invent a fake production row.

**Explicitly out of scope for this item:** implementing the dropdown layout or sticky-nav change from this note.

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
