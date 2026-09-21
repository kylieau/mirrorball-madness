# Session Handoff

## 1. Current State

**Home episode banner + results leaderboard song titles — shipped and pushed to
`origin/main` (`c2da7d7`, `9fa8f13`).** No work in progress on this side.

- **Episode banner** on `/today`: theatrical "Week N" strip (picks-open / on-air
  status, season-progress dots) that collapses into a slim sticky bar on scroll.
  Deadline stubs were quieted (ticket notches kept, flat muted tint, league name
  only, "Make picks ›" text link) and the Spoiler-Free callout lost its gold glow.
  User confirmed the banner works in a browser; the quieter stubs/callout were not
  explicitly confirmed by eye.
- **Results leaderboard** now shows the song title beside each dance style, one
  line per dance ("Foxtrot · Song Title").
- **Live data fixes (run by the user in the Supabase SQL Editor, verified
  read-only afterwards):** Week 1's dances were all on Night One (E1); the eight
  women's `dance_scores` + `episode_results` were moved to Night Two (E2). Men's
  Night One song titles were then filled in (title only, no artist).

Scoring calibration (`05173e9`) and competition weeks (PR #29) are older, shipped,
and unchanged.

**Another session is mid-flight** on Grand Finale lock work: uncommitted
`supabase/schema.sql` and untracked `supabase/apply-grand-finale-lock.sql` are
theirs — do not stage or commit them. `ios/App/App.xcodeproj/project.pbxproj` is
also a pre-existing unrelated modification.

## 2. Changes Made

`git diff --stat b5a77d7..HEAD` (this session's commits):
- `CLAUDE.md` — Episode-vs-Week bullet now describes the Home `EpisodeBanner`
  (replaced the old "Home has no season strip" line)
- `MEMORY_HANDOFF.md` — this file
- `src/app/globals.css` — `live-pulse` / `dot-glow` keyframes + `--animate-*` tokens
- `src/app/today/page.tsx` — computes banner state, passes `episodeBanner`, drops
  the unused `moduleLabel` from `deadlines`
- `src/app/this-week/page.tsx` — also selects `song_title` from `dance_scores`
- `src/components/episode-banner.tsx` — new (client component, IntersectionObserver
  collapse, `motion-reduce:` variants)
- `src/components/deadline-stub.tsx` — quiet restyle, text-link CTA
- `src/components/home-dashboard.tsx` — renders banner, label = league name only
- `src/components/spoiler-reveal-callout.tsx` — glow shadow replaced by thin border
- `src/components/weekly-results-view.tsx` — per-dance "Style · Song" lines
- `src/lib/episode-banner.ts` + `episode-banner.test.ts` — new pure helper + 6 tests

Untracked/local only (never committed, by repo convention): `scratch/` including
`fix-week1-dance-split.sql`, `add-week1-men-song-titles.sql`,
`check-week1-dance-split.mjs`, `check-week1-related.mjs`.

## 3. Key Decisions & Lessons Learned

- **Banner shows the show's `earliestAirsAt`, not a lock time** — picks lock time is
  per-league (`leagues.prediction_lock_hours_before_air`, `prediction_lock_at`), so a
  single global "Locks Tue 7pm" would be wrong. Per-league countdowns stay on the stubs.
- **"On air" is derived from `airs_at`**, never read from `episodes.status` —
  `'locked'` is declared but nothing ever writes it (only `upcoming ⇄ completed`).
- **No "Results are in" banner state** — `SpoilerRevealCallout` already owns that for
  Spoiler-Free viewers, and for everyone else `liveWeek` advances the moment results
  publish. Banner has two states only; hidden when there is no live week or the live
  week has no episodes.
- **Fan copy is "Week N"** (`formatEpisodeCasual`), not "Episode N" — the mockup's
  wording was overridden by the repo convention.
- **Season track kept on purpose** despite the old "no season strip" note; CLAUDE.md
  was updated so the docs no longer contradict it.
- **Plans go stale fast in this repo.** The first banner plan was written against the
  old single `episodes` table; competition weeks (`competition_weeks` + `episodes`)
  landed underneath it. Re-read the real code (`src/lib/competition-week.ts`,
  `today/page.tsx`) and `git fetch && git log HEAD..origin/main` before trusting a plan.
- **A parallel session shares this working tree.** Stage files by name, never
  `git add -A`; check `git status` for others' WIP before committing.
- **Don't `npm run build` while `next dev` is listening on :3000** — it overwrites
  `.next` under the running server. Use `tsc --noEmit`, eslint and `npm test` instead.
- **Live DB writes are blocked from this container's tooling** (the permission
  classifier denied a service-role update). Hand the user a plain `.sql` file for the
  Supabase SQL Editor, then verify with a read-only service-role script. Reads work.
- **No TypeScript runner in the repo** — ad-hoc scripts must be plain `.mjs`, run from
  the project root with `NODE_OPTIONS="--experimental-websocket"`. The active season is
  found via `seasons.is_active`; `rpc("active_season_id")` returns null under the
  service role.
- **`episode_results` / `dance_scores` are keyed by `episode_id`** (judge scores follow
  via `dance_score_id`); scores, predictions and standings key off `week_id`, so moving
  dances between episodes of the same week needs no rescoring.
- **Scoring calibration lessons** (older): placement bonus is split across Dance Card
  and Grand Finale weights; `judges_score_multiplier` decreasing with roster size is
  correct as built; Monte Carlo scripts stay plain JS outside `src/`; re-run a full
  typecheck after any RPC signature change.

## 4. Backlog & Deferred Items

- Eyeball the quieter deadline stubs and the calmer Spoiler-Free callout on `/today`
  (banner itself is confirmed). Also try OS reduced-motion and the on-air state once
  an episode's `airs_at` has passed and it isn't completed.
- Episode 4 in the live data has the placeholder theme "test" (`airs_at`
  2026-09-21) sitting in its own week — likely leftover test data; check before it
  becomes the live week.
- Browser click-through of the Settings Placement Bonus fields and a live Curtain Call
  pick (from the scoring calibration work).
- Re-run the Monte Carlo script against real Season 35 data once enough weeks exist
  (`scripts/monte-carlo-calibration/README.md`).
- `dance_card_calibration` clamp-to-nearest path (roster size outside 1-6) never
  exercised live.
- DND / "—" live check still owed; safe deletion of `auth.users`/profiles with league
  history still has no automatic path (both pre-existing).

## 5. Next Steps

Nothing blocking or in flight on this work. When resuming:
1. Check `git status` and `git fetch && git log HEAD..origin/main` — the other
   session's Grand Finale lock work may have landed or changed shared files.
2. Default to waiting for the next feature request or bug report; if picking up
   backlog, start with the browser look at `/today` (item 1 above).
