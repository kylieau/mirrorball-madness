# Mirrorball Madness

A fantasy sports app for *Dancing with the Stars*, built for friends, watch parties, and online communities.

## Goals

- Let a group of friends run a season-long fantasy league around a real DWTS season with minimal manual bookkeeping.
- Support many independent leagues per user (office pool, family league, friend group) from a single account.
- Keep every league's rules commissioner-owned — scoring weights, roster size, and waiver behavior are configurable per league, not fixed defaults.
- Keep managers engaged even after an early elimination, via weekly predictions that run independently of roster survival.

## Core Features

- **Multi-league accounts** — one login, join or create any number of independent leagues via 6-character invite codes.
- **Live snake draft** — real-time draft room where managers take turns picking celebrity/pro couples; once picked, a couple is off the board for that league.
- **Customizable scoring** — judges' scores, survival bonus, podium bonus, and prediction bonuses are all commissioner-adjustable per league.
- **Weekly Pick 'Em** — every manager predicts the week's eliminated couple and top scorer before showtime lock, all season long.
- **Commissioner admin** — league setup, scoring configuration, roster size, and waiver rules.
- **Global results entry** — one admin form enters real judges' scores/eliminations per episode; results fan out and recompute standings across every league automatically.

## Tech Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Shadcn UI · Supabase (Auth, Postgres, Realtime)

## Build Roadmap

Each milestone should be independently testable before moving to the next.

### Phase 1 — Foundation & Auth
- [x] Scaffold Next.js app (TypeScript, Tailwind, App Router, ESLint)
- [x] Write initial Postgres schema (`supabase/schema.sql`)
- [x] Configure dev container port forwarding for the local dev server
- [x] Create Supabase project and connect via env vars (`.env.local` + `.env.example`)
- [x] Apply schema to the Supabase project
- [x] Install and configure Shadcn UI
- [x] Install Supabase client libraries (`@supabase/supabase-js`, `@supabase/ssr`)
- [x] Build base app shell/layout with header
- [x] Implement email/password sign-up + sign-in
- [x] Implement Google OAuth sign-in
- [x] Auto-create a `profiles` row on new user sign-up
- [x] **Verify:** a new user can sign up, see their name in the header, sign out, and sign back in

### Phase 2 — Leagues & Multi-League Switcher
- [x] Build "Create League" form (name, generates unique 6-character invite code)
- [x] Build "Join League via Code" form
- [x] Insert `league_members` row on create/join; assign commissioner role to the creator
- [x] Build `/leagues` hub screen listing joined leagues
- [x] Build global league switcher dropdown in the header
- [x] Write RLS policies: users can only read leagues/members they belong to
- [x] **Verify:** two test accounts can create a league, join via code, and see each other in the member list

### Phase 3 — Commissioner Settings
- [x] Build league settings form (roster size, waiver mode, waiver claim method, draft timer)
- [x] Build scoring settings form (judges multiplier, survival points, prediction points, podium bonuses)
- [x] Restrict the settings screen to the commissioner role
- [x] Write RLS policies: only the commissioner can write `leagues`/`scoring_settings` for their league — via `update_league_settings`/`update_scoring_settings` SECURITY DEFINER functions rather than direct table grants (no UPDATE grant exists on either table at all)
- [x] **Verify:** a non-commissioner manager can't access or edit settings; commissioner's changes persist and display correctly

### Phase 4 — Live Snake Draft
- [x] Seed the `couples` table for the active season — real Season cast, see `supabase/seed.sql`
- [x] Assign draft order/position to league members — commissioner can shuffle or manually reorder before starting
- [x] Build draft room UI: available vs. drafted couples board
- [x] Wire Supabase Realtime so picks broadcast live to all connected managers
- [x] Build turn indicator with a per-pick timer — server-authoritative clock (`leagues.current_turn_started_at`); timeout and sit-out/autopilot auto-picks go through `make_auto_draft_pick` (uniform random among eligible remaining; labeled `auto · random` in the log). Does not auto-start a draft.
- [x] Write `draft_picks` on each pick; enforce one-couple-per-league uniqueness — turn order and uniqueness enforced inside the `make_draft_pick` SECURITY DEFINER function, not trusted from the client
- [x] Seed `roster_slots` from `draft_picks` when the draft completes — `roster_size` is computed as `floor(couples ÷ members)` and set automatically when the draft starts (no longer commissioner-editable); the draft stops at member_count × roster_size, leaving any remainder couples undrafted for the season rather than splitting unevenly
- [x] **Verify:** two browsers in the same draft room see picks appear in real time, and an already-picked couple can't be picked again

### Phase 5 — Scoring Engine & Admin Results Entry
- [x] Build admin results-entry form: dance scores per couple per episode (supports multiple dances) — comma-separated scores per couple, e.g. "24, 27" for a two-dance week
- [x] Build admin results-entry form: episode outcomes (safe / eliminated / bottom-two / saved / podium)
- [x] Write the `computeWeeklyScores` pure function (roster points + survival + prediction matches + podium bonus) — `src/lib/scoring.ts`, no DB access, fully unit-testable
- [x] Unit test `computeWeeklyScores`: single dance, multi-dance week, judges'-save override, finale podium — `npm test` (Vitest, newly set up this phase)
- [x] Wire results submission to populate `weekly_manager_scores` for every affected league — runs server-side via the service_role key after checking `profiles.is_super_admin` (results entry is a cross-league admin operation, not scoped to one league's RLS)
- [x] **Verify:** submitting one week's results correctly updates point totals across two leagues with different custom scoring weights — confirmed via a real `applyEpisodeResults` call against two live leagues with different weights, producing different, correctly-computed totals from the same underlying results

### Phase 6 — Manager Dashboard & Pick 'Em
- [x] Build team roster card (active + eliminated couples, cumulative points)
- [x] Build live standings table (all managers, sorted by total points)
- [x] Build the weekly Pick 'Em lock box (elimination + top scorer predictions)
- [x] Enforce the prediction lock at `episodes.locks_at` — via `submit_prediction` (SECURITY DEFINER, same pattern as `make_draft_pick`); predictions are also hidden from other league members until lock, then revealed league-wide
- [x] Wire prediction resolution into the Phase 5 scoring engine — this was already done in Phase 5 (`applyEpisodeResults` already fed `predictions` into `computeWeeklyScores`); the actual gap was that `predictions` had no grants/RLS at all, so nothing could read or write a row until this phase
- [x] **Verify:** a prediction submitted before lock resolves correctly after results are entered; a late submission is rejected — confirmed end-to-end: submitted pre-lock, hidden from other members, late resubmit rejected, revealed post-lock, and correctly scored (30 + 20 = 50 prediction points) once results were entered

Note: episodes previously only ever came into existence already `completed` (Phase 5's results form always created+finished them atomically), which left no way for a prediction to have anything to lock against ahead of air. Fixed by making the same results form dual-purpose: submitting with no couple scores just schedules the episode (`status: 'upcoming'`) with a lock time; adding scores later flips it to `completed`.

### Phase 7 — Waivers
- [x] Detect open roster slots (couple eliminated, no waiver pickup yet) — derived, not stored: a slot is open when its current row (`end_week is null`) points at a couple whose `status = 'eliminated'`. Spoiler-Free hides that occupancy (`classifyRosterOccupancy`) until the elim week is revealed — Recast copy does not name who went home.
- [x] Build waiver claim submission UI — `/leagues/[id]/waivers`
- [x] Implement claim resolution per league's method (reverse standings / FCFS / manual) — FCFS resolves immediately on submission; reverse_standings and manual stay pending until the commissioner processes/approves them (`process_reverse_standings_waivers`, `approve_waiver_claim`/`reject_waiver_claim`)
- [x] Update `roster_slots` on an approved claim — closes the old row (`end_week` = claim week) and inserts a new one (`start_week` = claim week + 1), all inside one `finalize_waiver_claim` helper shared by all three resolution paths
- [x] **Verify:** in a waiver-enabled league, an open slot can be claimed and the new couple starts scoring for that manager the following week — confirmed end-to-end (FCFS claim → roster_slots timeline correct → next week's results correctly score the new couple, not the eliminated one), plus reverse-standings priority (lower season total wins a contested couple) verified separately

Found and fixed a real Phase 6 bug while building this: `roster_slots` had no SELECT grant/RLS at all, so the Phase 6 roster card's query was silently getting `permission denied` and rendering nothing for every user (the error was never checked). Fixed here since this phase needed real `roster_slots` reads anyway.

### Phase 8 — Design Pass & Deploy
- [x] Apply dark mode + gold accent (`#D4AF37`) theme across all screens — fixed theme, no light/dark toggle (there's no toggle mechanism in the app at all); the palette lives directly in `:root` rather than behind a `.dark` class
- [x] Full mobile responsiveness pass on all four core screens — done across every screen in the app, not just four; fixed several real overflow risks (header crowding on narrow widths, a 5-column admin results grid, 2-column settings/waiver rows) that would have broken well before the 4-screen list was written
- [x] Security review: confirm RLS policies cover every table and write path — audited every table's grants/RLS and every SECURITY DEFINER function's execute grants; **found and fixed a live, exploitable privilege-escalation bug**: `profiles` had a blanket UPDATE grant with only row-level RLS (no column restriction), so any signed-in user could set `is_super_admin = true` on themselves directly. Confirmed exploitable, fixed with a column-level grant (`display_name`, `avatar_url` only), verified the fix and confirmed no prior exploitation had occurred. Also tightened an `EXECUTE` grant on an internal helper function that had been left broader than necessary.
- [x] Deploy to Vercel and connect the production Supabase project — done early (after Phase 2) so the app was reachable outside the dev container; production is the same Supabase project used throughout development, not yet split into separate dev/prod projects
- [x] **Verify:** full user journey (sign up → create league → draft → submit prediction → view results) works end-to-end in production — confirmed against the live Supabase project: sign-up (with trigger-based profile creation) → league creation/join → full snake draft → prediction submitted pre-lock → results entered → scores correctly computed and visible to both the predicting manager and the commissioner (standings)
