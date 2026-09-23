# Mirrorball Madness

Fantasy sports app for Dancing with the Stars. Next.js 15 (App Router), TypeScript, Tailwind CSS v4, Shadcn UI (base-nova style, built on Base UI), Supabase (Auth + Realtime + Postgres).

## Commands

- `npm run dev` — dev server
- `npm run build` — production build (type-checks as part of the build)
- `npm run lint` — ESLint
- `npm test` — Vitest, runs pure-logic tests under `src/lib/`
- Regenerate types after any schema change:
  ```
  npx supabase gen types typescript --project-id wssbwgtsejamlbvfofvu --schema public > src/lib/supabase/types.ts
  ```
  Needs `SUPABASE_ACCESS_TOKEN` (personal access token from supabase.com/dashboard/account/tokens) — this container has no Docker for local introspection.

`supabase/schema.sql` is the source of truth for the DB schema. It's applied directly via `psql` (no migration files/CLI linking).

## Rules

- **Write clean code.** No dead code, no speculative abstractions, no comments explaining *what* code does — only *why*, when the reason isn't obvious from the code itself.
- **Respect the dev container setup** (`.devcontainer/devcontainer.json`). Don't work around it (global tools outside the container, hardcoded host-specific paths). If the container itself needs to change (new port, new dependency), edit `devcontainer.json`.
- **Never put API keys, secrets, or credentials in code files.** All secrets go in `.env.local` (gitignored), read via `process.env`. Document new secret keys (not values) in `.env.example`.
- **Test changes before finishing.** Run `npm run build`, `npm run lint`, and `npm test` (if the change touches pure logic). Exercise the actual feature path in a browser for user-facing changes — passing type checks/tests is not the same as verifying the feature works.
- **Keep this file and other docs in sync** with what the app actually does.

## Architecture & Conventions

- **Every user-facing write goes through a `SECURITY DEFINER` Postgres function**, never a direct table write from the client. These run with `set search_path = ''`, so every reference inside them must be schema-qualified (`public.leagues`, `auth.uid()`, etc.). Authorization lives inside the function body (`auth.uid()` checks), not in RLS alone — RLS on these tables is read-scoping, not write-scoping.
- **Column-level grants, not blanket ones, for self-editable rows.** e.g. `profiles` grants `UPDATE (display_name, avatar_url)` only, not a blanket `UPDATE`, since RLS's "owner" policy only checks row ownership and a blanket grant would let a user set any column on their own row (including privilege flags). Follow this pattern for any self-editable column that shouldn't be fully user-writable.
- **Server actions split logic from authorization.** Non-trivial write logic lives in a plain exported function in `src/lib/*.ts` (DB-free where possible, or taking an already-authorized client); the `"use server"` action wrapping it is thin — just the "who's allowed" check plus a call into that function. This makes the logic callable from a test script directly, without a live Next.js request context.
- **Results entry has three access tiers** on `/admin/results` (titled "Scores" in the UI): **View** (any signed-in user — seeing how results get entered is deliberately open), **Propose** (`is_super_admin` or commissioner of any league, via `requireProposeAccess()` — writes only to `draft_*` tables, zero live effect until publish), **Admin/Publish** (`is_super_admin` only, via `requireAdminAccess()` — publishing recomputes every league's scores). Client-side hiding of actions per tier is UX only; the action-level checks are the real enforcement.
- **Data model facts:**
  - `roster_slots` is a timeline, not a snapshot: one row per occupancy period, current occupant is the row with `end_week is null`.
  - `people` unifies celebrities/pros/judges under one table (`role` column) so the same real person is one row across seasons/dances. `people.archived_at` soft-hides a judge (don't hard-delete one with `judge_scores` history).
  - `league_id → leagues(id)` FKs cascade on delete; `manager_id`/`user_id`/`commissioner_id → profiles(id)` FKs do not.
  - **Co-manager**: a team can have a second person (duo, max 2) with full parity via `league_members.co_manager_id`. Every team-scoped table still stores the primary's `user_id` as the team identity. `resolve_acting_league_member(p_league_id)` resolves either id back to the primary; write RPCs route through it. Any client-side "is this me" comparison of `auth.uid()` against a manager/user column must check both ids (`findOwnMembership`/`isOwnMembership` in `src/lib/acting-manager.ts`) or a co-manager sees themselves as a stranger to their own team. Combined display name goes through `formatManagerName` (`src/lib/manager-display.ts`).
  - `leagues` persist across seasons; only `couples`/`episodes` (and anything keyed to them) carry a `season_id`, resolved via `active_season_id()`.
  - **Episode vs Week:** an Episode is one TV airing (`episodes.episode_number`, unique per season). A Week is a fantasy competition round (`competition_weeks.week_number`, unique per season) — `episodes.week_id` links them, and a week can span multiple episodes. Exhibition/interview nights leave `week_id` null and never appear on Results/Picks. Admin/site-ops copy uses `formatEpisodeLabel` (`S35 E02`); fan-facing copy uses the casual helpers in `src/lib/format-week.ts` (`Week N` / `Week N — {theme}`, `formatNightsLabel`). Predictions, `weekly_manager_scores`, spoiler progress, and elimination outcomes key off `week_id`; dance scores key off `episode_id`.
  - **Dance styles vs round types:** `dance_styles` is what was danced (waltz, jive, …) and carries a `category` (`ballroom`/`latin`/`show`). Round types (Team Dance, Trio Dance, Instant Dance, …) are a managed `round_types` table, assigned per-episode via `episode_round_types`.
  - Auto-draft (`make_auto_draft_pick`) uses the on-the-clock manager's private `draft_queues` ranking, falling back to a random eligible couple. Timeout uses `leagues.current_turn_started_at` + `pick_time_limit_seconds`; sit-out is `league_members.draft_autopilot`. `draft_picks.is_auto`/`auto_source` record how a pick was made server-side only. `leagues.draft_type` is `snake`/`linear`/`custom` (custom stores the full sequence in `leagues.custom_pick_order`). Turn-order resolution lives in `src/lib/draft.ts` (`managerIdForPick`) — don't hand-roll it elsewhere.
  - Recast/waiver couple status must go through `spoilerSafeCoupleStatus`/`resolveSpoilerCutoff`/`isSpoilerSafeActive` — never key copy or eligibility off raw `eliminated`/`withdrawn`.
  - **Grand Finale** ranks the whole season cast (eliminated couples included). Couples whose elimination is already revealed to the viewer are pinned first via `pinEliminatedFirst` (`src/lib/grand-finale-pins.ts`); pinning is UI-only, the RPC doesn't enforce it.
  - **Grand Finale positions**: 1 = first eliminated .. N = winner. `eliminationPositionRanges` (`src/lib/scoring.ts`) gives couples eliminated the same week a shared range (a double elimination is 2 wide; a no-elimination week takes none), and both the scoring engine (`results.ts`) and the Picks UI use it. `grandFinalePredictionPoints` credits a prediction inside its couple's range as exact; `grandFinaleBestCasePoints` is the "up to N" ceiling for a couple still in (it can only finish at or after the next open slot). Changing position logic only affects points on the next publish/correct of each week.
  - Account deletion is request-and-review: `request_account_deletion` stamps `profiles.deletion_requested_at`; nothing auto-deletes `auth.users` or cascades a league wipe.
  - **Scoring**: `scoring_settings` holds commissioner-editable point values; defaults are calibrated via `scripts/monte-carlo-calibration/` (plain Node). `judges_score_multiplier` is roster-size-keyed (`dance_card_calibration` table), guarded by `judges_score_multiplier_customized` so it never clobbers a commissioner override. Curtain Call payouts scale by `couplesRemaining / totalCouples` (`curtainCallPayout` in `src/lib/scoring.ts`); the picking UI renders its preview through the same helper so it can't drift from what's actually scored. Grand Finale's full-order pick supports three methods (`distance_based`, `exact_position`, `band_tier`), each calibrated to the same variance budget — math lives in `bandOf`/`bandPayoutFraction` (`src/lib/scoring.ts`) and `src/lib/grand-finale-explainer.ts`. **Point scale**: every calibrated default is the calibration script's solved output times a flat `POINT_SCALE = 0.1` (a `run.mjs` constant) — a pure linear rescale, since every scoring formula only sums/multiplies these constants, so it preserves every relative-influence ratio the calibration solved for and is purely a unit change (2026-09-23, `supabase/apply-point-scale-rescale.sql` — the pre-scale defaults put a single week's score in the 1000s). Re-running the script for a future re-fit already bakes this in; don't re-derive it by hand.
- **Cross-league picks** (Curtain Call + Grand Finale) are a one-time copy via `submitPredictionToLeagues`/`submitGrandFinalePredictionToLeagues`, never a link — the RPCs stay the authority on membership/module-off/lock; `planDestination` (`src/lib/copy-picks.ts`) only decides what to offer.
- **League at a Glance** = every *other* manager's picks, appended to the bottom of the module's existing card on Picks (never a separate card; the viewer is excluded because their own picks are the card above). Curtain Call (`CurtainCallLeagueList`) and Dance Card (`DanceCardLeagueList`) follow whatever week that card's carousel shows, and order managers by points that week then alphabetically; carousels are untouched. Grand Finale (`GrandFinaleLeagueList`, inside `GrandFinaleBox`, once locked) has no week: it shows each manager's "next predicted elimination" via `nextPredictedElimination` (`src/lib/grand-finale-pins.ts`) — the couple in the next elimination slot, computed against the *viewer's* spoiler-clamped couples so no bracket can spoil a viewer who is behind. Expand/collapse state persists per viewer through `usePersistedState` (`src/lib/use-persisted-state.ts`, the repo's only `localStorage` use). The Curtain Call per-pick lines are recomputed live while the week total is the stored `weekly_manager_scores` value, so they disagree until a week is republished after a scoring-setting change.
- **Shared data loaders**: `/admin/results`, `/admin/schedule`, and `/admin/show-settings` share season data (episodes, weeks, drafts, roster) via `loadResultsPageData` (`src/lib/results-page-data.ts`) so the query shape can't drift across pages.

## Environment Gotchas

- **No live database credentials in this container.** Schema/RPC changes are written to a `.sql` file for the user to run via the Supabase Dashboard SQL Editor, then verified afterward with the service-role key. Never wrap SQL in a bash heredoc when handing it over — paste it as a plain `.sql` file or fenced block only.
- **Integration-test against the live project with real throwaway accounts**, not service-role bypass — most RPCs check `auth.uid()`, which a service-role call never populates. Pattern: `admin.auth.admin.createUser()` + anon client `signInWithPassword()`, always cleaned up (including the throwaway `auth.users` rows) in a `finally` block.
- **Ad-hoc verification scripts must run from the project root**, not a scratchpad directory — otherwise ESM `import` of `@supabase/supabase-js` fails to resolve `node_modules`. Also needs `NODE_OPTIONS="--experimental-websocket"` on Node 20, or the realtime client throws "native WebSocket not found" even for scripts that never touch realtime.
- **`league_members.role` only accepts `'commissioner'` / `'manager'`** — not `'member'`.
- **A stale `tsconfig.tsbuildinfo` can make `next build`'s type-check fail with an error that doesn't match current source.** If that happens and `npx tsc --noEmit` passes clean, `rm -rf .next` and retry before assuming the code is broken.
- **This repo often has more than one thing in flight** (parallel sessions, the iOS Capacitor wrapper's `project.pbxproj`). When committing, stage files by name for the specific change being made — never `git add -A` — so unrelated in-progress work doesn't get swept in.

## UI Component Patterns

- **Add new base-nova primitives via the shadcn CLI**, not by hand: `npx shadcn@latest add <name>` pulls it already adapted to this project's import paths and styling.
- **Base UI's `Select` needs an explicit `items` prop** (`Record<string, ReactNode>`) or the closed trigger renders the raw value instead of a resolved label.
- **`Button` composed with `render={<Link .../>}` needs `nativeButton={false}`** — `Button` defaults to `nativeButton={true}`, which assumes a real `<button>`; composing onto a `Link` renders an `<a>` and Base UI logs a console error in dev otherwise. (Doesn't apply to `SheetTrigger`/`DialogTrigger` wrapping a `Button` — those still render a real `<button>`.)
- **A Base UI `Dialog`/`Sheet`/`Tabs` root supports multiple `Trigger`s** pointing at the same root — no need to lift state to open the same sheet/dialog from two places.
- **Use the `cn` helper** (from the `cn` package, tailwind-merge-compatible) instead of raw `clsx` — a later conflicting class always wins, so it's safe to override a generated component's default classes via `className`.
- **Date/time hydration safety**: absolute date/time formatting (viewer's local timezone) must be computed client-side after mount (`useEffect`, empty deps), never during initial render — the server has no meaningful browser timezone. Relative durations (a countdown) have no such ambiguity and are safe to compute in a Server Component.
- **Module order is Curtain Call → Dance Card → Grand Finale everywhere** it's listed (Your Picks sections, Standings, Settings, create-league dialog). Defined once in `SCORING_MODULES` (`src/lib/scoring-modules.ts`) — derive any new module list from it.
- **Capitalization**: anything that names a thing (page/card/section titles, buttons, badges, field/setting labels, dropdown options, nav items) is Title Case. Full phrases and sentences (descriptions, helper text, status/empty messages) stay sentence case. Hidden `aria-label`s are left alone.
- **Fan/admin tab bars** stay `fixed` to the viewport bottom on every width and span the `max-w-2xl` content column. Shared chrome is `BottomNav`/`FanBottomNav` (`src/components/bottom-nav.tsx`).

## Settled Decisions

Deliberate omissions and naming calls. Code can't record an absence, so these come back as "improvements" otherwise — don't re-propose them.

- **Dance Card is not copyable across leagues** (drafts are per-league); only Curtain Call and Grand Finale are.
- **No light/dark toggle** — one fixed look by choice. A full theme redo is wanted eventually (BACKLOG.md), not a toggle.
- **"Bracket"** in Your Season Bracket is deliberate: a full outcome prediction submitted up front and locked, like a March Madness bracket, even though it's one order rather than matchups.
- **Roster per-couple points are judges' points only** (`judgePointsThroughWeek`); survival/placement bonuses stay manager-level, and the card says so.
- **Manager order on shared roster cards** is `orderManagersForRosters`: viewer first, then alphabetical, until anyone has scored — then standings order.
- **Standings' roster card has no week carousel**; flipping weeks lives on Your Fantasy Roster only.
- **No per-league gear icons** on Home cards or the league switcher; only `league-header.tsx`'s first-run nudges link into settings.
- **Add to Home Screen is UX guidance only** — no first-visit modal, no push subscribe button, no service worker.
- **In Jeopardy is manual ticks** on Enter Results (the TV called-down group), never derived from judges' bottom-N. Auto-detection, a band-size knob, and top-3 scoring were all dropped during design.
