-- Mirrorball Madness — core schema
-- Postgres / Supabase. Single active season for v1 (no season table).
-- RLS is enabled on every table (via the project's "automatic RLS" setting); policies
-- are added incrementally as each feature needs them, rather than all upfront.
--
-- "Automatically expose new tables" is OFF for this project, so Postgres grants to
-- anon/authenticated are also added incrementally per table (grants gate access before
-- RLS is even evaluated). service_role is the exception: it already bypasses RLS by
-- design, so it gets blanket table privileges below rather than per-table grants.

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;

create extension if not exists "pgcrypto";

-- ============================================================
-- Users
-- ============================================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  is_super_admin boolean not null default false, -- global results-entry admin
  created_at timestamptz not null default now(),
  -- Account deletion is request-and-review, not instant: a manager's
  -- historical roster_slots/predictions/weekly_manager_scores rows are
  -- deliberately not cleaned up when they leave a league (see leave_league),
  -- since they're woven into other members' shared league history — so there's
  -- no safe automatic cascade to actually erase auth.users/profiles today.
  -- This column is just the in-app "yes, I asked to be deleted" record Apple's
  -- App Store review requires (5.1.1(v)). Super-admins review the queue at
  -- /admin/accounts (or supabase/queries/pending-account-deletions.sql).
  -- There is still no safe automatic cascade to erase auth.users/profiles.
  deletion_requested_at timestamptz,
  -- Spoiler-Free Mode: hides episode results app-wide until the viewer marks
  -- that episode as watched (see spoiler_watch_progress below). Same trust
  -- tier as display_name/avatar_url — a plain self-editable flag, no
  -- side-effect check needed, unlike is_super_admin/deletion_requested_at.
  spoiler_free_mode boolean not null default false
);

-- ============================================================
-- Seasons
-- Leagues themselves are NOT season-scoped yet (a new league per year, for
-- now) — this just lets couples/episodes carry history across years instead
-- of every new season overwriting the last one. couples/episode-counting
-- logic (draft totals, the waiver wire, results-entry pickers) all need to
-- filter to the active season via active_season_id() below, or a second
-- season's rows would silently corrupt the first season's in-progress data.
-- ============================================================

create table seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  -- Schedule-tab display only ("TBD" when null) — episodes.airs_at is the
  -- actual per-week source of truth used everywhere scoring/locking reads
  -- a date; these three never feed a computation.
  premiere_date date,
  finale_date date,
  total_episodes int check (total_episodes is null or total_episodes > 0),
  -- Display only (formatEpisodeLabel's "S{n}E{n}") — separate from name so
  -- it doesn't depend on parsing free text like "Season 35".
  season_number int
);

create unique index seasons_one_active on seasons (is_active) where is_active;

grant select on public.seasons to authenticated;
create policy "seasons are viewable by all authenticated users"
on public.seasons for select
using (true);

create function public.active_season_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.seasons where is_active limit 1;
$$;

revoke execute on function public.active_season_id() from public;
grant execute on function public.active_season_id() to authenticated;

-- ============================================================
-- Leagues
-- ============================================================

create table leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique, -- 6-char code
  commissioner_id uuid not null references profiles(id),
  roster_size int not null default 3 check (roster_size > 0),
  waiver_mode text not null default 'locked' check (waiver_mode in ('locked', 'waivers')),
  waiver_claim_method text check (waiver_claim_method in ('reverse_standings', 'fcfs', 'manual')),
  draft_scheduled_at timestamptz,
  draft_type text not null default 'snake' check (draft_type in ('snake', 'linear', 'custom')),
  -- 'custom' only: the full pick-by-pick sequence, custom_pick_order[pick_number]
  -- = user_id. An array rather than its own table because it is read once per
  -- pick from the already-locked leagues row. Null for snake/linear.
  custom_pick_order uuid[],
  pick_time_limit_seconds int not null default 90,
  draft_status text not null default 'not_started' check (draft_status in ('not_started', 'in_progress', 'completed')),
  -- Server clock for whoever is on the clock. Set when the draft starts and
  -- reset after every pick (manual or auto). make_auto_draft_pick times out
  -- against this; clients only display it. Null until the draft has started.
  current_turn_started_at timestamptz,
  -- How long before an episode's real-world airs_at this league's Pick 'Em
  -- predictions close. Deliberately a per-league lead time, not a per-league
  -- absolute lock timestamp: every league locks relative to the same real
  -- air time, they just get to choose how much buffer they want.
  prediction_lock_hours_before_air numeric not null default 0 check (prediction_lock_hours_before_air >= 0),
  created_at timestamptz not null default now(),

  constraint waiver_method_required check (
    (waiver_mode = 'locked' and waiver_claim_method is null) or
    (waiver_mode = 'waivers' and waiver_claim_method is not null)
  )
);

create table league_members (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  user_id uuid not null references profiles(id),
  role text not null default 'manager' check (role in ('commissioner', 'manager')),
  draft_position int, -- assigned when draft order is set
  -- Sit-out / autopilot: when true, make_auto_draft_pick may fire on this
  -- manager's turn without waiting for the pick clock. Does not start a draft.
  draft_autopilot boolean not null default false,
  -- Co-manager: a second person (max 2 per team) with full parity — either
  -- person can draft, submit predictions, edit the queue, everything.
  -- Team-scoped tables (draft_picks, roster_slots, predictions, etc.) keep
  -- storing user_id (the primary) as the team identity; resolve_acting_
  -- league_member resolves a co-manager's auth.uid() back to it before every
  -- write, so no downstream table needs a co-manager column. Self-service:
  -- the primary mints co_manager_invite_code (generate_co_manager_invite_code)
  -- and shares it; join_as_co_manager redeems it and clears the code.
  co_manager_id uuid references profiles(id),
  co_manager_invite_code text,
  joined_at timestamptz not null default now(),
  unique (league_id, user_id),
  unique (league_id, draft_position),
  constraint league_members_co_manager_not_self check (co_manager_id is distinct from user_id)
);

-- One person can be co-manager of at most one team per league (mirrors
-- unique(league_id, user_id) for primaries). Deliberately not globally
-- unique — nothing stops someone co-managing in one league while primary/
-- co-manager elsewhere, same as primaries aren't restricted that way either.
create unique index league_members_co_manager_unique
  on public.league_members (league_id, co_manager_id)
  where co_manager_id is not null;

create unique index league_members_co_manager_invite_code_unique
  on public.league_members (co_manager_invite_code)
  where co_manager_invite_code is not null;

-- judges_score_multiplier..fifth_place_points: per-event point values within
-- the Judges' Scores category (draft fantasy) and the Eliminations category
-- (elimination_prediction_points/top_scorer_prediction_points — both weekly
-- Pick 'Em guesses, folded into one "Eliminations" category total).
--
-- *_category_enabled/*_category_weight: a league opts into any subset of the
-- three categories (Judges' Scores / Eliminations / Bonus Picks) and weights
-- each independently — Standings sums roster/prediction/bonus-pick points
-- multiplied by their category's weight, not a flat total. At least one
-- category must stay on (see at_least_one_category_enabled below).
--
-- judges_score_starts_week: the number of the first competition week that
-- counts toward Judges' Scores — if the draft is deferred until after Week 1
-- airs, Week 1 doesn't count (no roster existed yet). Points to any scheduled
-- week, not capped at week 1 vs 2, so a late draft several weeks in
-- works the same way — the commissioner picks a real week off the
-- schedule rather than typing a raw number.
--
-- bonus_picks_*: the season-long full-elimination-order prediction (made
-- once, tracked as weeks resolve). Only meaningful when
-- bonus_picks_category_enabled — see bonus_picks_config_required below for
-- what "configured" requires per scoring method.
--
-- Placement bonus (a rostered couple finishing in the finale's top 5) lives
-- entirely in Dance Card: first_place_points..fifth_place_points, weighted
-- by judges_score_category_weight alongside dance score and survival. See
-- computeWeeklyScores in src/lib/scoring.ts. Grand Finale used to have its
-- own copy of this bonus (bonus_picks_first_place_points..fifth_place_points)
-- but it paid out for the same roster-luck event Dance Card already
-- rewards, not anything Grand Finale's full-order prediction actually
-- measures — removed. Every point value below is an ordinary
-- commissioner-editable default, calibrated (not hand-set) by
-- scripts/monte-carlo-calibration/ — see that script for how, and
-- judges_score_multiplier_customized below for why judges_score_multiplier
-- is the one column with special write semantics.
--
-- Every commissioner-editable field on this table EXCEPT judges_score_multiplier
-- (which has its own draft-start auto-calibration, above) locks together the
-- moment effective_grand_finale_deadline() passes — the same Season Clock
-- anchor that already starts Judges' Scores counting and locks Grand Finale
-- predictions, just also now covering the settings that scored them. One
-- shared trigger, not one per category — a per-category lock would let a
-- commissioner see one category's real results before finalizing another's
-- weight, which defeats the point of locking at all. See
-- update_scoring_categories for the check. locking_exempt grandfathers in
-- leagues that already existed when this locking behavior shipped.
create table scoring_settings (
  league_id uuid primary key references leagues(id) on delete cascade,
  judges_score_multiplier numeric not null default 1.0,
  -- Flips true (and stays true) the moment a commissioner explicitly saves a
  -- value for judges_score_multiplier via update_scoring_categories — so
  -- start_draft's roster-size-keyed calibrated default (see
  -- dance_card_calibration below) only overwrites this column while nobody
  -- has customized it yet, never clobbering an intentional pre-draft choice.
  judges_score_multiplier_customized boolean not null default false,
  survival_points numeric not null default 15,
  elimination_prediction_points numeric not null default 171, -- 0 disables
  top_scorer_prediction_points numeric not null default 114, -- 0 disables
  first_place_points numeric not null default 106,
  second_place_points numeric not null default 53,
  third_place_points numeric not null default 28,
  fourth_place_points numeric not null default 14,
  fifth_place_points numeric not null default 7,

  judges_score_category_enabled boolean not null default true,
  eliminations_category_enabled boolean not null default true,
  bonus_picks_category_enabled boolean not null default false,
  judges_score_category_weight numeric not null default 1,
  eliminations_category_weight numeric not null default 1,
  bonus_picks_category_weight numeric not null default 1,

  judges_score_starts_week int not null default 1 check (judges_score_starts_week > 0),

  bonus_picks_scoring_method text check (bonus_picks_scoring_method in ('exact_position', 'distance_based', 'band_tier')),
  bonus_picks_distance_penalty numeric, -- points docked per position off; only used by 'distance_based'
  bonus_picks_tier_size int, -- couples per band (3 = 1st-3rd, 4th-6th, ...); only used by 'band_tier'
  bonus_picks_tier_pay_style text not null default 'equal' check (bonus_picks_tier_pay_style in ('equal', 'graded')), -- 'graded': lower bands pay 75/50/25% (floor 25%); only used by 'band_tier'
  -- Base value a correctly-placed couple earns. Calibrated per method
  -- (scripts/monte-carlo-calibration/): exact_position 264, distance_based 207,
  -- band_tier 166 equal / 259 graded — the column default matches the
  -- distance_based default method.
  bonus_picks_points_per_correct numeric not null default 207,

  -- Every new league gets this row with defaults on insert (create_league),
  -- but the commissioner never explicitly reviewed them until they save this
  -- form at least once. The league dashboard redirects a commissioner to
  -- Settings until this flips true, so scoring categories are a required
  -- creation step rather than silent defaults nobody looked at.
  scoring_configured boolean not null default false,

  -- Grandfathers in leagues that existed before scoring-settings locking
  -- shipped — set true for all of them by the live migration, default false
  -- (i.e. lock applies normally) for every league created afterward.
  locking_exempt boolean not null default false,

  constraint at_least_one_category_enabled check (
    judges_score_category_enabled or eliminations_category_enabled or bonus_picks_category_enabled
  ),
  constraint bonus_picks_config_required check (
    (not bonus_picks_category_enabled) or (
      bonus_picks_scoring_method is not null
      and (bonus_picks_scoring_method != 'distance_based' or bonus_picks_distance_penalty is not null)
      and (bonus_picks_scoring_method != 'band_tier' or bonus_picks_tier_size is not null)
    )
  )
);

-- Monte Carlo-derived (scripts/monte-carlo-calibration/), one row per swept
-- roster size (couples per manager). start_draft() reads this once, at the
-- moment roster_size is fixed, to seed scoring_settings.judges_score_multiplier
-- for that league. Never queried anywhere else — update_scoring_categories()
-- only ever writes judges_score_multiplier directly, this table is
-- read-only reference data.
create table dance_card_calibration (
  roster_size int primary key check (roster_size > 0),
  judges_score_multiplier_default numeric not null
);

grant select on public.dance_card_calibration to authenticated;
create policy "dance card calibration is viewable by all authenticated users"
on public.dance_card_calibration for select
using (true);

insert into public.dance_card_calibration (roster_size, judges_score_multiplier_default) values
  (1, 2.362),
  (2, 1.618),
  (3, 1.332),
  (4, 1.168),
  (5, 1.072),
  (6, 1.053);

-- ============================================================
-- Couples (global for the active season)
-- ============================================================

-- Pros and judges return year after year (with different partners, for pros);
-- celebrities occasionally do too (All-Stars-style seasons). All three are
-- "people" with a role, not fields baked into couples/dance_scores — so the
-- same pro/judge across multiple seasons is the same row here, not free text
-- repeated (and potentially misspelled) each time.
create table people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null check (role in ('celebrity', 'pro', 'judge')),
  photo_url text,
  -- Soft-hide for scoring judges (null = standing panel). Past judge_scores
  -- stay; archived judges are omitted from empty Enter Results score boxes.
  -- Celebrities/pros leave this null — they are season-scoped via couples.
  -- Only the admin archive action writes this, and only for role='judge'.
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (name, role)
);

create table couples (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id),
  celebrity_id uuid not null references people(id),
  pro_id uuid not null references people(id),
  -- withdrawn = left mid-season (e.g. injury), distinct from a real vote-off:
  -- opens the roster slot the same as eliminated, but doesn't resolve an
  -- "Eliminated" Pick 'Em prediction as correct and earns no survival points
  -- that week (see computeWeeklyScores). "bye" (sat out, still competing)
  -- never becomes a couples.status value at all — the couple stays 'active'.
  status text not null default 'active' check (status in ('active', 'eliminated', 'withdrawn', 'winner', 'runner_up', 'third_place')),
  elimination_week int,
  created_at timestamptz not null default now(),
  unique (season_id, celebrity_id, pro_id)
);

-- ============================================================
-- Draft
-- ============================================================

create table draft_picks (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  couple_id uuid not null references couples(id),
  manager_id uuid not null references profiles(id),
  round int not null,
  pick_number int not null, -- overall pick number within the draft
  picked_at timestamptz not null default now(),
  -- True when make_auto_draft_pick placed this (timeout or autopilot), not
  -- the manager choosing a couple. Draft log labels these `auto · random`.
  is_auto boolean not null default false,
  -- Where an auto-pick came from: the manager's own queue or the random
  -- fallback. Null for manual picks. Draft log labels `auto · queue` / `auto · random`.
  auto_source text check (auto_source in ('queue', 'random')),
  unique (league_id, couple_id),
  unique (league_id, pick_number)
);

-- A manager's ranked wishlist for auto-picks (autopilot or an expired clock).
-- Private: only its owner can read it. Ranking order is array order; entries
-- that are already drafted or no longer active are skipped at pick time, and
-- when the list is exhausted make_auto_draft_pick falls back to random.
create table draft_queues (
  league_id uuid not null references leagues(id) on delete cascade,
  user_id uuid not null references profiles(id),
  couple_ids uuid[] not null default '{}',
  primary key (league_id, user_id)
);

-- ============================================================
-- Roster ownership timeline (seeded from draft_picks, mutated by waivers)
-- This is the source of truth scoring and waiver eligibility query against.
-- ============================================================

create table roster_slots (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  manager_id uuid not null references profiles(id),
  slot_number int not null, -- 1..roster_size
  couple_id uuid references couples(id), -- null = open slot
  source text not null check (source in ('draft', 'waiver')),
  start_week int not null,
  end_week int, -- set when this couple is eliminated and the slot is later refilled
  unique (league_id, manager_id, slot_number, start_week)
);

create table waiver_claims (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  couple_id uuid not null references couples(id),
  manager_id uuid not null references profiles(id),
  slot_number int not null,
  week_number int not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  priority_order int, -- resolved at claim time per league's waiver_claim_method
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- ============================================================
-- Competition weeks (fantasy rounds) vs TV episodes
-- A Week is the fan-facing unit (Results, Curtain Call, elim outcome,
-- spoiler mark, standings "through Week N"). An Episode is one TV airing
-- (schedule row, that night's cast, dances / judge scores). Premiere
-- Night One + Night Two are two episode rows under Week 1. Exhibition /
-- interview nights have week_id null and never appear on Results/Picks.
-- Do not reintroduce week_part; do not fold two airings into one episode.
-- ============================================================

create table competition_weeks (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id),
  week_number int not null check (week_number > 0), -- 1..N per season; unique below
  theme text, -- optional week-level label ("Premiere"); fan carousel prefers this
  is_elimination_week boolean not null default true,
  is_finale boolean not null default false,
  -- Set ahead of air time on the Schedule tab. Gates Curtain Call's Pick 'Em
  -- to collecting two elimination guesses instead of one (submit_prediction
  -- enforces "0 or 2, never 1" filled slots) — results entry itself already
  -- supports any number of eliminations per week with no flag needed.
  is_double_elimination_week boolean not null default false,
  unique (season_id, week_number)
);

grant select on public.competition_weeks to authenticated;
create policy "competition weeks are viewable by all authenticated users"
on public.competition_weeks for select
using (true);

create table episodes (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id),
  -- TV airing sequence for admin/ops labels (S35 E01). Independent of
  -- competition_weeks.week_number so two premiere nights can be E01 + E02
  -- under Week 1, and an interview can be E03 with no week assignment.
  episode_number int not null check (episode_number > 0),
  week_id uuid references competition_weeks(id) on delete restrict,
  airs_at timestamptz not null, -- actual real-world air date/time; set per episode, not assumed weekly-regular
  theme text, -- e.g. "Night One", "Villains Night" — free text, not a managed list
  -- Set on Schedule. A soft cap for how many dances Enter Results offers per
  -- couple (the finale is not uniform), not a hard limit. Publish does not
  -- overwrite it.
  expected_dance_count int not null default 1,
  status text not null default 'upcoming' check (status in ('upcoming', 'locked', 'completed')),
  -- guest_judge_name is a leftover caption, not a people(role='judge') row.
  -- It is not shown anywhere and is no longer editable in Enter Results —
  -- if a guest actually scores, add them via Admin → Settings as a real
  -- people row so they get a score box, then Archive them when they're done
  -- (people.archived_at) so later weeks don't keep an empty box. Draft
  -- save/publish still pass the stored value through so existing rows aren't
  -- wiped. people exists to unify recurring individuals across seasons
  -- (draft picks, judge_scores joins); a blank judge_scores row for a given
  -- dance means that judge simply didn't score it that week.
  guest_judge_name text,
  judges_save_available boolean not null default false,
  results_published_at timestamptz,
  results_published_by uuid references profiles(id) on delete set null,
  unique (season_id, episode_number)
);

create index idx_episodes_week on episodes(week_id);

-- Admin-managed, extensible by the "add a dance style" admin form rather than
-- a code change (unlike Status/Note, a new dance style is pure labeling with
-- no scoring-logic implications, so there's nothing for it to be inconsistent
-- with).
create table dance_styles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  -- Closed set (ballroom / latin / show). Null until categorized in Show
  -- Settings — category is chosen on the row after adding, not at add time.
  category text check (category in ('ballroom', 'latin', 'show')),
  created_at timestamptz not null default now()
);

-- Round types (Team Dance, Trio Dance, Instant Dance, …) are not dance
-- styles. A round type is round-wide — on a team-dance night the whole cast
-- does one — so it belongs on the episode, declared when the night is
-- scheduled, not as a per-couple flag. Managed like dance_styles because the
-- list grows season to season; a per-dance format column and availability
-- windows were deliberately not added.
create table round_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

insert into round_types (name) values
  ('Team Dance'),
  ('Trio Dance'),
  ('Instant Dance'),
  ('Judges'' Choice'),
  ('Redemption Dance');

-- One row per couple per dance, so multi-dance weeks (finals, team dances) just
-- add rows. total_score is the sum of that dance's judge_scores rows, computed
-- once at write time (in applyEpisodeResults) rather than re-derived on every
-- read — the scoring engine only ever needs the aggregate, so this keeps
-- computeWeeklyScores unchanged while judge_scores carries the detail.
create table dance_scores (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references episodes(id) on delete cascade,
  couple_id uuid not null references couples(id),
  dance_style_id uuid not null references dance_styles(id),
  song_title text,
  total_score numeric not null, -- e.g. 24 for 24/30 — sum of judge_scores
  created_at timestamptz not null default now()
);

-- Per-judge score for one dance_scores row, so "discrepancy across judges" is
-- a normal query instead of parsing jsonb. A judge with no row for a given
-- dance simply didn't score it that week (e.g. a guest judge who only judged
-- one episode) — there's no "judge panel per episode" concept to maintain.
create table judge_scores (
  id uuid primary key default gen_random_uuid(),
  dance_score_id uuid not null references dance_scores(id) on delete cascade,
  judge_id uuid not null references people(id),
  score numeric not null,
  unique (dance_score_id, judge_id)
);

-- Per-couple outcome per episode. Supports double-elimination weeks (just
-- insert two 'eliminated' rows that week — no special flag needed) and
-- no-elimination weeks (insert zero 'eliminated' rows — see competition_weeks.is_elimination_week
-- for the week-level version of this). was_bottom_two/was_bottom_three/
-- saved_by_judges/had_immunity are independent flags, not
-- mutually exclusive with each other or with outcome — a couple can be Safe,
-- in the Bottom 2, and saved by judges all in the same week.
--
-- bonus_points/bonus_note cover one-off scoring events that don't fit a named
-- format (dance-off wins, relay wins, etc.) without needing bespoke schema per
-- format — added directly into that couple's weekly roster points in
-- computeWeeklyScores. had_immunity is record-keeping only (the app records
-- what actually happened rather than simulating the vote, so an immune
-- couple simply isn't marked Eliminated that week) — it has no scoring or
-- elimination-blocking effect of its own.
create table episode_results (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references episodes(id) on delete cascade,
  couple_id uuid not null references couples(id),
  outcome text not null check (outcome in ('safe', 'eliminated', 'withdrawn', 'bye', 'winner', 'runner_up', 'third_place')),
  was_bottom_two boolean not null default false,
  was_bottom_three boolean not null default false,
  saved_by_judges boolean not null default false,
  had_immunity boolean not null default false,
  bonus_points numeric not null default 0,
  bonus_note text,
  unique (episode_id, couple_id)
);

-- ============================================================
-- Weekly Pick 'Em predictions
-- ============================================================

create table predictions (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  manager_id uuid not null references profiles(id),
  week_id uuid not null references competition_weeks(id),
  predicted_eliminated_couple_id uuid references couples(id),
  -- Only ever set on a competition_weeks.is_double_elimination_week round — both
  -- slots filled or both null, enforced in submit_prediction (a cross-table
  -- check isn't possible here). A normal week's predictions never touch it.
  predicted_eliminated_couple_id_2 uuid references couples(id),
  predicted_top_scorer_couple_id uuid references couples(id),
  submitted_at timestamptz not null default now(),
  unique (league_id, manager_id, week_id),
  constraint predictions_distinct_eliminated_picks check (
    predicted_eliminated_couple_id_2 is null
    or predicted_eliminated_couple_id_2 <> predicted_eliminated_couple_id
  )
);

-- ============================================================
-- Grand Finale: a one-time, season-long prediction of the full elimination
-- order. One row per couple per manager (mirrors draft_picks/roster_slots'
-- one-row-per-item convention) rather than a single array column, so each
-- couple's predicted position can be queried/joined directly when scoring.
-- position 1 = predicted first eliminated ... N = predicted winner.
-- ============================================================

create table grand_finale_predictions (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  manager_id uuid not null references profiles(id),
  couple_id uuid not null references couples(id),
  predicted_position int not null,
  submitted_at timestamptz not null default now(),
  unique (league_id, manager_id, couple_id),
  unique (league_id, manager_id, predicted_position)
);

-- ============================================================
-- Cached weekly + cumulative scores (recomputed on admin results entry)
-- ============================================================

create table weekly_manager_scores (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  manager_id uuid not null references profiles(id),
  week_id uuid not null references competition_weeks(id),
  roster_points numeric not null default 0,
  prediction_points numeric not null default 0,
  -- This week's incremental Grand Finale contribution only (couples whose
  -- fate first became known this round), not a running cumulative total —
  -- summed across weeks the same way roster/prediction points already are.
  grand_finale_points numeric not null default 0,
  -- The only one of these four that's actually weighted (judges_score/
  -- eliminations/bonus_picks_category_weight applied in computeWeeklyScores);
  -- the others stay raw so their un-weighted values are still visible.
  total_points numeric not null default 0,
  computed_at timestamptz not null default now(),
  unique (league_id, manager_id, week_id)
);

-- ============================================================
-- Indexes for common lookups
-- ============================================================

create index idx_league_members_user on league_members(user_id);
create index idx_roster_slots_league_manager on roster_slots(league_id, manager_id);
create index idx_roster_slots_open on roster_slots(league_id) where couple_id is null;
create index idx_dance_scores_episode_couple on dance_scores(episode_id, couple_id);
create index idx_predictions_league_week on predictions(league_id, week_id);
create index idx_weekly_scores_league_week on weekly_manager_scores(league_id, week_id);

-- ============================================================
-- Auth: auto-create a profile row for every new auth.users row
-- ============================================================

-- display_name comes from our own email/password sign-up form; full_name/name/avatar_url
-- are what Google OAuth populates instead, so both sources are checked.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- A manager needs to read/update their own profile (e.g. the header, account
-- settings). Broader visibility (e.g. to fellow league members) is added in
-- Phase 2 alongside league_members policies.
--
-- UPDATE is column-restricted, not blanket: the "owner" policy below only
-- checks row ownership (auth.uid() = id), so a blanket UPDATE grant would let
-- any user set is_super_admin = true on themselves directly through the
-- profiles table — this was live in production and self-confirmed exploitable
-- before being caught in the Phase 8 security review. display_name/avatar_url
-- are the only columns a user should ever be able to set on their own row.
grant select on public.profiles to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;
grant update (spoiler_free_mode) on public.profiles to authenticated;

create policy "profiles are viewable by the owner"
on public.profiles for select
using (auth.uid() = id);

create policy "profiles are updatable by the owner"
on public.profiles for update
using (auth.uid() = id);

-- deletion_requested_at is deliberately NOT in the column-level update grant
-- above (display_name/avatar_url only) — same reasoning as is_super_admin:
-- a self-service column a user could set directly would be fine here (it's
-- not a privilege escalation), but routing it through a function lets the
-- commissioner check below actually be enforced, not just a UI suggestion.
create function public.request_account_deletion()
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from public.league_members where user_id = auth.uid() and role = 'commissioner'
  ) then
    raise exception 'You are the commissioner of at least one league — leave or hand those off before requesting deletion';
  end if;

  update public.profiles set deletion_requested_at = now() where id = auth.uid();
end;
$$;

create function public.cancel_account_deletion()
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.profiles set deletion_requested_at = null where id = auth.uid();
end;
$$;

revoke execute on function public.request_account_deletion() from public;
revoke execute on function public.cancel_account_deletion() from public;
grant execute on function public.request_account_deletion() to authenticated;
grant execute on function public.cancel_account_deletion() to authenticated;

-- ============================================================
-- Leagues: writes go through SECURITY DEFINER functions (so the caller can't
-- forge a commissioner role or skip generating a real invite code); reads are
-- scoped by RLS to leagues/members the caller actually belongs to.
-- ============================================================

create function public.create_league(
  p_name text,
  p_dance_card_enabled boolean default true,
  p_curtain_call_enabled boolean default true,
  p_grand_finale_enabled boolean default true
)
returns public.leagues
language plpgsql
security definer set search_path = ''
as $$
declare
  v_league public.leagues;
  v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I/L to avoid ambiguity
  v_code text;
  v_i int;
  v_premiere_airs_at timestamptz;
  v_grand_finale_enabled boolean;
begin
  if trim(p_name) = '' then
    raise exception 'League name is required';
  end if;

  -- Grand Finale's deadline is derived from the Hard Deadline (see
  -- effective_grand_finale_deadline below), which resolves to nothing until
  -- a real episode exists — so enabling it before a season's Week 1 is
  -- scheduled would leave it permanently locked with no honest deadline.
  select min(e.airs_at) into v_premiere_airs_at
  from public.episodes e
  join public.competition_weeks w on w.id = e.week_id
  where w.season_id = public.active_season_id() and w.week_number = 1;
  v_grand_finale_enabled := p_grand_finale_enabled and v_premiere_airs_at is not null;

  if not (p_dance_card_enabled or p_curtain_call_enabled or v_grand_finale_enabled) then
    raise exception 'At least one scoring module must be enabled';
  end if;

  loop
    v_code := '';
    for v_i in 1..6 loop
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    end loop;
    exit when not exists (select 1 from public.leagues where invite_code = v_code);
  end loop;

  insert into public.leagues (name, invite_code, commissioner_id)
  values (trim(p_name), v_code, auth.uid())
  returning * into v_league;

  insert into public.league_members (league_id, user_id, role)
  values (v_league.id, auth.uid(), 'commissioner');

  -- The commissioner explicitly reviewed these toggles during creation
  -- (unlike the old name-only flow), so scoring_configured is true right
  -- away — no post-creation "finish setup" prompt for new leagues.
  insert into public.scoring_settings (
    league_id,
    judges_score_category_enabled,
    eliminations_category_enabled,
    bonus_picks_category_enabled,
    bonus_picks_scoring_method,
    bonus_picks_distance_penalty,
    scoring_configured
  )
  values (
    v_league.id,
    p_dance_card_enabled,
    p_curtain_call_enabled,
    v_grand_finale_enabled,
    case when v_grand_finale_enabled then 'distance_based' end,
    case when v_grand_finale_enabled then 50 end,
    true
  );

  return v_league;
end;
$$;

create function public.join_league(p_invite_code text)
returns public.leagues
language plpgsql
security definer set search_path = ''
as $$
declare
  v_league public.leagues;
begin
  select * into v_league
  from public.leagues
  where invite_code = trim(upper(p_invite_code));

  if not found then
    raise exception 'Invite code not found';
  end if;

  if v_league.draft_status = 'in_progress' then
    raise exception 'Draft in progress — ask the commissioner to cancel it first';
  end if;

  insert into public.league_members (league_id, user_id, role)
  values (v_league.id, auth.uid(), 'manager')
  on conflict (league_id, user_id) do nothing;

  return v_league;
end;
$$;

-- Deliberately does NOT cascade-delete roster_slots/predictions/
-- grand_finale_predictions/weekly_manager_scores for the departing manager —
-- those stay intact for the league's own history/standings math. Leaving
-- just revokes membership/visibility going forward, same as a real sports
-- league handles someone dropping out mid-season. A commissioner can't leave
-- directly — demote_commissioner to manager first (blocked if they're the
-- last commissioner), then leave normally.
--
-- Co-manager edge case: user_id is the permanent identity six other tables
-- hang their history off (draft_picks, roster_slots, predictions,
-- grand_finale_predictions, weekly_manager_scores, draft_queues), so a
-- primary can't leave while a co-manager is attached — auto-promoting the
-- co-manager into user_id would either orphan history under the old id or
-- require rewriting rows across all six tables. Detach via remove_co_manager
-- first. A co-manager's own "leave" routes through remove_co_manager too,
-- never this function (it only ever matches user_id) — checked FIRST, before
-- is_league_commissioner: full parity means a co-manager of a commissioner's
-- team passes is_league_commissioner too, so checking that first would tell
-- them "commissioners can't leave" (misleading — they aren't personally the
-- commissioner) instead of pointing them at the actual right action. Live-
-- tested and caught by scratch/test-co-manager.mjs's D-is-co-manager-of-
-- commissioner-A case.
create function public.leave_league(p_league_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from public.league_members
    where league_id = p_league_id and co_manager_id = auth.uid()
  ) then
    raise exception 'Use "Leave as co-manager" instead';
  end if;

  if public.is_league_commissioner(p_league_id) then
    raise exception 'Commissioners can''t leave their own league';
  end if;

  if exists (
    select 1 from public.leagues
    where id = p_league_id and draft_status = 'in_progress'
  ) then
    raise exception 'Draft in progress — ask the commissioner to cancel it first';
  end if;

  if exists (
    select 1 from public.league_members
    where league_id = p_league_id and user_id = auth.uid() and co_manager_id is not null
  ) then
    raise exception 'Detach your co-manager before leaving';
  end if;

  delete from public.league_members
  where league_id = p_league_id and user_id = auth.uid();

  if not found then
    raise exception 'You are not a member of this league';
  end if;
end;
$$;

-- Co-manager invite / join / remove. Self-service: the primary manager mints
-- a per-team code from their own row (same charset/collision-loop style as
-- create_league's league-wide invite_code), shares it out-of-band, and the
-- recipient redeems it. remove_league_member needs no change of its own — it
-- deletes the whole row, which already detaches both people in one shot.
create function public.generate_co_manager_invite_code(p_league_id uuid)
returns text
language plpgsql
security definer set search_path = ''
as $$
declare
  v_row public.league_members;
  v_code text;
  v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_i int;
begin
  select * into v_row from public.league_members
  where league_id = p_league_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'You are not a member of this league';
  end if;

  if v_row.co_manager_id is not null then
    raise exception 'This team already has a co-manager';
  end if;

  loop
    v_code := '';
    for v_i in 1..6 loop
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    end loop;
    exit when not exists (
      select 1 from public.league_members where co_manager_invite_code = v_code
    );
  end loop;

  update public.league_members set co_manager_invite_code = v_code where id = v_row.id;

  return v_code;
end;
$$;

revoke execute on function public.generate_co_manager_invite_code(uuid) from public;
grant execute on function public.generate_co_manager_invite_code(uuid) to authenticated;

create function public.join_as_co_manager(p_code text)
returns public.leagues
language plpgsql
security definer set search_path = ''
as $$
declare
  v_row public.league_members;
  v_league public.leagues;
begin
  select * into v_row from public.league_members
  where co_manager_invite_code = trim(upper(p_code))
  for update;

  if not found then
    raise exception 'Invite code not found';
  end if;

  if v_row.co_manager_id is not null then
    raise exception 'This team already has a co-manager';
  end if;

  if v_row.user_id = auth.uid() then
    raise exception 'You can''t be your own co-manager';
  end if;

  if exists (
    select 1 from public.league_members
    where league_id = v_row.league_id
      and (user_id = auth.uid() or co_manager_id = auth.uid())
  ) then
    raise exception 'You are already a member of this league';
  end if;

  select * into v_league from public.leagues where id = v_row.league_id;

  if v_league.draft_status = 'in_progress' then
    raise exception 'Draft in progress — ask the manager to try again after the draft';
  end if;

  update public.league_members
  set co_manager_id = auth.uid(), co_manager_invite_code = null
  where id = v_row.id;

  return v_league;
end;
$$;

revoke execute on function public.join_as_co_manager(text) from public;
grant execute on function public.join_as_co_manager(text) to authenticated;

-- Lets the /join/co-manager/[code] page show which league and whose team a
-- signed-in visitor is about to co-manage, instead of a generic "you've been
-- invited" with no context. authenticated-only (this schema never grants
-- anon anything), keyed only by the code — same trust boundary
-- join_as_co_manager already uses, caller doesn't need to be a member yet.
create function public.get_co_manager_invite_info(p_code text)
returns table(league_name text, primary_display_name text)
language sql
security definer
set search_path = ''
stable
as $$
  select l.name, p.display_name
  from public.league_members lm
  join public.leagues l on l.id = lm.league_id
  join public.profiles p on p.id = lm.user_id
  where lm.co_manager_invite_code = trim(upper(p_code))
  limit 1;
$$;

revoke execute on function public.get_co_manager_invite_info(text) from public;
grant execute on function public.get_co_manager_invite_info(text) to authenticated;

-- Callable by the primary (detach their own co-manager), the co-manager
-- themself (self-service "leave"), or the commissioner (parity with
-- remove_league_member). No draft-in-progress block — detaching a
-- co-manager never touches the team's draft-turn rights.
create function public.remove_co_manager(p_league_id uuid, p_team_user_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_row public.league_members;
begin
  select * into v_row from public.league_members
  where league_id = p_league_id and user_id = p_team_user_id;

  if not found or v_row.co_manager_id is null then
    raise exception 'That team does not have a co-manager to remove';
  end if;

  if not (
    public.is_league_commissioner(p_league_id)
    or auth.uid() = v_row.user_id
    or auth.uid() = v_row.co_manager_id
  ) then
    raise exception 'You are not allowed to remove this co-manager';
  end if;

  update public.league_members
  set co_manager_id = null, co_manager_invite_code = null
  where id = v_row.id;
end;
$$;

revoke execute on function public.remove_co_manager(uuid, uuid) from public;
grant execute on function public.remove_co_manager(uuid, uuid) to authenticated;

-- Commissioner-initiated counterpart to leave_league — same deliberate
-- non-cascade (roster_slots/predictions/weekly_manager_scores stay intact
-- for league history), just triggered on someone else's behalf. The
-- `role != 'commissioner'` guard means a commissioner (co- or original)
-- has to be demoted via demote_commissioner before they can be removed —
-- keeps "remove" and "demote" as two separate, deliberate actions.
create function public.remove_league_member(p_league_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Only the commissioner can remove a member';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Use Leave League to remove yourself';
  end if;

  if exists (
    select 1 from public.leagues
    where id = p_league_id and draft_status = 'in_progress'
  ) then
    raise exception 'Draft in progress — ask the commissioner to cancel it first';
  end if;

  delete from public.league_members
  where league_id = p_league_id and user_id = p_user_id and role != 'commissioner';

  if not found then
    raise exception 'That person is not a removable member of this league';
  end if;
end;
$$;

-- Full parity: any commissioner (original or promoted) can promote another
-- member, and once promoted a co-commissioner is indistinguishable from the
-- original — same privileges everywhere, including promoting/demoting
-- others.
create function public.promote_to_commissioner(p_league_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Only a commissioner can promote a member';
  end if;

  update public.league_members
  set role = 'commissioner'
  where league_id = p_league_id and user_id = p_user_id and role = 'manager';

  if not found then
    raise exception 'That person is not a promotable member of this league';
  end if;
end;
$$;

-- Blocked when it would leave the league with zero commissioners — every
-- league must always have at least one. No separate ownership-transfer
-- flow: with co-commissioners, demoting yourself (as long as someone else
-- still holds the role) is that flow.
create function public.demote_commissioner(p_league_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_commissioner_count int;
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Only a commissioner can demote another commissioner';
  end if;

  select count(*) into v_commissioner_count
  from public.league_members
  where league_id = p_league_id and role = 'commissioner';

  if v_commissioner_count <= 1 then
    raise exception 'A league must have at least one commissioner';
  end if;

  update public.league_members
  set role = 'manager'
  where league_id = p_league_id and user_id = p_user_id and role = 'commissioner';

  if not found then
    raise exception 'That person is not a commissioner of this league';
  end if;
end;
$$;

-- Separate from update_league_settings (waiver/draft-timer config) since
-- renaming applies regardless of which modules are on, so the form that
-- edits it shouldn't be entangled with the Dance-Card-conditional section
-- those other fields live in.
create function public.rename_league(p_league_id uuid, p_name text)
returns public.leagues
language plpgsql
security definer set search_path = ''
as $$
declare
  v_league public.leagues;
begin
  if trim(p_name) = '' then
    raise exception 'League name is required';
  end if;

  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Only the commissioner can rename this league';
  end if;

  update public.leagues
  set name = trim(p_name)
  where id = p_league_id
  returning * into v_league;

  return v_league;
end;
$$;

-- No membership-count restriction — available to the commissioner any time,
-- not just before anyone else has joined. The UI is expected to gate this
-- behind a strong confirmation (e.g. typing the league name) instead, since
-- a member-count rule would just make it useless once a league has grown.
-- Every dependent table already cascades on leagues(id) on delete cascade,
-- so a plain delete here is a complete, clean removal with no manual cleanup.
create function public.delete_league(p_league_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Only the commissioner can delete this league';
  end if;

  delete from public.leagues
  where id = p_league_id;
end;
$$;

revoke execute on function public.create_league(text, boolean, boolean, boolean) from public;
revoke execute on function public.join_league(text) from public;
revoke execute on function public.leave_league(uuid) from public;
revoke execute on function public.remove_league_member(uuid, uuid) from public;
revoke execute on function public.promote_to_commissioner(uuid, uuid) from public;
revoke execute on function public.demote_commissioner(uuid, uuid) from public;
revoke execute on function public.rename_league(uuid, text) from public;
revoke execute on function public.delete_league(uuid) from public;
grant execute on function public.create_league(text, boolean, boolean, boolean) to authenticated;
grant execute on function public.join_league(text) to authenticated;
grant execute on function public.leave_league(uuid) to authenticated;
grant execute on function public.remove_league_member(uuid, uuid) to authenticated;
grant execute on function public.promote_to_commissioner(uuid, uuid) to authenticated;
grant execute on function public.demote_commissioner(uuid, uuid) to authenticated;
grant execute on function public.rename_league(uuid, text) to authenticated;
grant execute on function public.delete_league(uuid) to authenticated;

grant select on public.leagues to authenticated;
grant select on public.league_members to authenticated;

-- A league_members policy can't query league_members directly — Postgres treats
-- any self-reference in a table's own RLS policy as recursion and refuses it,
-- even when the predicate would terminate. Routing the check through a
-- SECURITY DEFINER function sidesteps this: the function's internal query runs
-- with RLS bypassed, so there's nothing left to recurse into.
create function public.is_league_member(p_league_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.league_members
    where league_id = p_league_id
      and (user_id = auth.uid() or co_manager_id = auth.uid())
  );
$$;

revoke execute on function public.is_league_member(uuid) from public;
grant execute on function public.is_league_member(uuid) to authenticated;

-- Returns the effective (primary) league_members.user_id for whichever of
-- {user_id, co_manager_id} matches the caller, or null if the caller isn't
-- on any row for this league. Every write RPC that inserts/compares
-- auth.uid() directly AS the manager identity routes through this instead,
-- so a co-manager's actions land on the team's one shared identity rather
-- than creating a second, orphaned identity under their own uuid.
create function public.resolve_acting_league_member(p_league_id uuid)
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select user_id from public.league_members
  where league_id = p_league_id
    and (user_id = auth.uid() or co_manager_id = auth.uid())
  limit 1;
$$;

revoke execute on function public.resolve_acting_league_member(uuid) from public;
grant execute on function public.resolve_acting_league_member(uuid) to authenticated;

-- Same rationale as is_league_member above. Every "only the commissioner
-- can..." check used to compare against leagues.commissioner_id directly,
-- which only ever held one person. league_members.role already supported
-- 'commissioner' on any number of rows per league — it just never had more
-- than one in practice — so that's the real source of truth for co-
-- commissioners (added via promote_to_commissioner below), not the single
-- commissioner_id column. commissioner_id is left in place purely as a
-- record of who originally created the league; nothing checks it anymore.
create function public.is_league_commissioner(p_league_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.league_members
    where league_id = p_league_id
      and (user_id = auth.uid() or co_manager_id = auth.uid())
      and role = 'commissioner'
  );
$$;

revoke execute on function public.is_league_commissioner(uuid) from public;
grant execute on function public.is_league_commissioner(uuid) to authenticated;

create policy "leagues are viewable by members"
on public.leagues for select
using (public.is_league_member(id));

create policy "league members are viewable by fellow members"
on public.league_members for select
using (public.is_league_member(league_id));

-- Broadens the Phase 1 "owner only" profiles policy: a member list needs to
-- show fellow members' display names, not just your own.
create policy "profiles are viewable by fellow league members"
on public.profiles for select
using (
  exists (
    select 1 from public.league_members lm1
    join public.league_members lm2 on lm1.league_id = lm2.league_id
    where (lm1.user_id = auth.uid() or lm1.co_manager_id = auth.uid())
      and (lm2.user_id = profiles.id or lm2.co_manager_id = profiles.id)
  )
);

-- ============================================================
-- Commissioner settings: same SECURITY DEFINER write pattern as
-- create_league/join_league, so the commissioner check lives in one place
-- (the function) instead of relying on RLS column-level tricks or the client
-- honestly only sending the fields the UI shows.
-- ============================================================

grant select on public.scoring_settings to authenticated;

create policy "scoring settings are viewable by league members"
on public.scoring_settings for select
using (public.is_league_member(league_id));

-- roster_size is NOT settable here — it's derived from couples-count /
-- member-count and only ever set by start_draft, once the member list (and
-- therefore the even split) is locked in.
create function public.update_league_settings(
  p_league_id uuid,
  p_waiver_mode text,
  p_waiver_claim_method text,
  p_pick_time_limit_seconds int,
  p_prediction_lock_hours_before_air numeric,
  p_draft_type text,
  p_draft_scheduled_at timestamptz
)
returns public.leagues
language plpgsql
security definer set search_path = ''
as $$
declare
  v_league public.leagues;
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Only the commissioner can update league settings';
  end if;

  -- draft_type/draft_scheduled_at only take effect pre-draft: changing the
  -- pick-order math or the scheduled time after picks are already underway
  -- would corrupt whose-turn-it-is for a draft already in progress.
  update public.leagues
  set
    waiver_mode = p_waiver_mode,
    waiver_claim_method = p_waiver_claim_method,
    pick_time_limit_seconds = p_pick_time_limit_seconds,
    prediction_lock_hours_before_air = p_prediction_lock_hours_before_air,
    draft_type = case when draft_status = 'not_started' then p_draft_type else draft_type end,
    -- Switching away from 'custom' drops the stale sequence, so a later switch
    -- back cannot silently reuse an order built for a different member list.
    custom_pick_order = case
      when draft_status = 'not_started' and p_draft_type <> 'custom' then null
      else custom_pick_order
    end,
    draft_scheduled_at = case when draft_status = 'not_started' then p_draft_scheduled_at else draft_scheduled_at end
  where id = p_league_id
  returning * into v_league;

  return v_league;
end;
$$;

-- One function per category's full rule set, rather than splitting "is this
-- category on" (toggles/weights/timing) from "how many points is X worth"
-- across two functions/forms — the UI groups everything by category, so the
-- write path matches. Every per-event point value is included regardless of
-- which categories are on; the UI only shows/edits the ones that apply, and
-- an inactive category's fields just keep round-tripping their last value.
create function public.update_scoring_categories(
  p_league_id uuid,
  p_judges_score_category_enabled boolean,
  p_eliminations_category_enabled boolean,
  p_bonus_picks_category_enabled boolean,
  p_judges_score_category_weight numeric,
  p_eliminations_category_weight numeric,
  p_bonus_picks_category_weight numeric,
  p_judges_score_starts_week int,
  p_bonus_picks_scoring_method text,
  p_bonus_picks_distance_penalty numeric,
  p_bonus_picks_tier_size int,
  p_judges_score_multiplier numeric,
  p_survival_points numeric,
  p_first_place_points numeric,
  p_second_place_points numeric,
  p_third_place_points numeric,
  p_elimination_prediction_points numeric,
  p_top_scorer_prediction_points numeric,
  p_bonus_picks_points_per_correct numeric,
  p_fourth_place_points numeric,
  p_fifth_place_points numeric,
  p_bonus_picks_tier_pay_style text
)
returns public.scoring_settings
language plpgsql
security definer set search_path = ''
as $$
declare
  v_settings public.scoring_settings;
  v_current public.scoring_settings;
  v_deadline timestamptz;
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Only the commissioner can update scoring categories';
  end if;

  -- Turning Dance Card off mid-draft would make every remaining pick fail
  -- record_draft_pick's Dance Card check and strand the draft.
  if not p_judges_score_category_enabled and exists (
    select 1 from public.leagues
    where id = p_league_id and draft_status = 'in_progress'
  ) then
    raise exception 'Dance Card can''t be turned off while the draft is in progress';
  end if;

  select * into v_current from public.scoring_settings where league_id = p_league_id;
  if not found then
    raise exception 'Scoring settings not found for this league';
  end if;

  -- Everything except judges_score_multiplier locks together the moment the
  -- Season Clock anchor passes (see the comment above scoring_settings) —
  -- one shared trigger, not per category, so a commissioner can never see
  -- one category's real results before finalizing another's weight. A no-op
  -- resave (every value already matches) still succeeds, since the Settings
  -- form always round-trips every field regardless of what actually changed.
  v_deadline := public.effective_grand_finale_deadline(p_league_id);
  if not v_current.locking_exempt and v_deadline is not null and now() >= v_deadline then
    if (
      p_judges_score_category_enabled, p_eliminations_category_enabled, p_bonus_picks_category_enabled,
      p_judges_score_category_weight, p_eliminations_category_weight, p_bonus_picks_category_weight,
      p_judges_score_starts_week, p_bonus_picks_scoring_method, p_bonus_picks_distance_penalty,
      p_bonus_picks_tier_size, p_bonus_picks_tier_pay_style, p_survival_points,
      p_first_place_points, p_second_place_points, p_third_place_points, p_fourth_place_points, p_fifth_place_points,
      p_elimination_prediction_points, p_top_scorer_prediction_points, p_bonus_picks_points_per_correct
    ) is distinct from (
      v_current.judges_score_category_enabled, v_current.eliminations_category_enabled, v_current.bonus_picks_category_enabled,
      v_current.judges_score_category_weight, v_current.eliminations_category_weight, v_current.bonus_picks_category_weight,
      v_current.judges_score_starts_week, v_current.bonus_picks_scoring_method, v_current.bonus_picks_distance_penalty,
      v_current.bonus_picks_tier_size, v_current.bonus_picks_tier_pay_style, v_current.survival_points,
      v_current.first_place_points, v_current.second_place_points, v_current.third_place_points, v_current.fourth_place_points, v_current.fifth_place_points,
      v_current.elimination_prediction_points, v_current.top_scorer_prediction_points, v_current.bonus_picks_points_per_correct
    ) then
      raise exception 'Scoring settings are locked for the season — the Grand Finale deadline has passed';
    end if;
  end if;

  update public.scoring_settings
  set
    judges_score_category_enabled = p_judges_score_category_enabled,
    eliminations_category_enabled = p_eliminations_category_enabled,
    bonus_picks_category_enabled = p_bonus_picks_category_enabled,
    judges_score_category_weight = p_judges_score_category_weight,
    eliminations_category_weight = p_eliminations_category_weight,
    bonus_picks_category_weight = p_bonus_picks_category_weight,
    judges_score_starts_week = p_judges_score_starts_week,
    bonus_picks_scoring_method = p_bonus_picks_scoring_method,
    bonus_picks_distance_penalty = p_bonus_picks_distance_penalty,
    bonus_picks_tier_size = p_bonus_picks_tier_size,
    bonus_picks_tier_pay_style = p_bonus_picks_tier_pay_style,
    -- Right-hand sides here still see the pre-update row, even though
    -- judges_score_multiplier is also being overwritten in this same
    -- statement — so this correctly flags "did the commissioner just change
    -- it" without a separate select.
    judges_score_multiplier_customized = judges_score_multiplier_customized
      or (judges_score_multiplier is distinct from p_judges_score_multiplier),
    judges_score_multiplier = p_judges_score_multiplier,
    survival_points = p_survival_points,
    first_place_points = p_first_place_points,
    second_place_points = p_second_place_points,
    third_place_points = p_third_place_points,
    fourth_place_points = p_fourth_place_points,
    fifth_place_points = p_fifth_place_points,
    elimination_prediction_points = p_elimination_prediction_points,
    top_scorer_prediction_points = p_top_scorer_prediction_points,
    bonus_picks_points_per_correct = p_bonus_picks_points_per_correct,
    scoring_configured = true
  where league_id = p_league_id
  returning * into v_settings;

  return v_settings;
end;
$$;

revoke execute on function public.update_league_settings(uuid, text, text, int, numeric) from public;
revoke execute on function public.update_scoring_categories(uuid, boolean, boolean, boolean, numeric, numeric, numeric, int, text, numeric, int, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text) from public;
grant execute on function public.update_league_settings(uuid, text, text, int, numeric) to authenticated;
grant execute on function public.update_scoring_categories(uuid, boolean, boolean, boolean, numeric, numeric, numeric, int, text, numeric, int, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text) to authenticated;

-- ============================================================
-- Draft: couples are global read-only reference data; starting the draft and
-- making picks are SECURITY DEFINER functions so turn order, one-couple-per-
-- league uniqueness, and completion/roster-seeding are enforced server-side —
-- a client can't skip its turn or claim an already-picked couple by racing
-- the UI, since the server recomputes whose turn it is from the pick count
-- every call (under a row lock on the league, to close the race between two
-- simultaneous picks). Auto-picks (timeout or autopilot) go through
-- make_auto_draft_pick, which takes the picker's highest-ranked available
-- couple from their draft_queues row, else chooses uniformly at random among
-- eligible remaining couples, and records draft_picks.is_auto / auto_source —
-- it never starts a draft.
-- ============================================================

grant select on public.people to authenticated;

create policy "people are viewable by all authenticated users"
on public.people for select
using (true);

grant select on public.couples to authenticated;

create policy "couples are viewable by all authenticated users"
on public.couples for select
using (true);

grant select on public.draft_picks to authenticated;

create policy "draft picks are viewable by league members"
on public.draft_picks for select
using (public.is_league_member(league_id));

grant select on public.draft_queues to authenticated;

create policy "draft queues are viewable by their owner"
on public.draft_queues for select
using (
  exists (
    select 1 from public.league_members
    where league_id = draft_queues.league_id
      and user_id = draft_queues.user_id
      and (user_id = auth.uid() or co_manager_id = auth.uid())
  )
);

-- Sets (or overwrites) the full draft order before the draft starts. The
-- client always calls this before start_draft — including for the "random"
-- case, where the client just shuffles the list itself and submits that —
-- so start_draft has a single, simple precondition: every member already has
-- a position.
create function public.set_draft_order(p_league_id uuid, p_ordered_user_ids uuid[])
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_league public.leagues;
  v_member_count int;
  v_distinct_count int;
  v_user_id uuid;
  v_position int := 1;
begin
  select * into v_league from public.leagues where id = p_league_id for update;

  if not found or not public.is_league_commissioner(p_league_id) then
    raise exception 'Only the commissioner can set the draft order';
  end if;

  if not exists (
    select 1 from public.scoring_settings
    where league_id = p_league_id and judges_score_category_enabled
  ) then
    raise exception 'Dance Card is not enabled for this league';
  end if;

  if v_league.draft_status <> 'not_started' then
    raise exception 'Draft order can only be set before the draft starts';
  end if;

  select count(*) into v_member_count from public.league_members where league_id = p_league_id;
  select count(distinct u) into v_distinct_count from unnest(p_ordered_user_ids) as u;

  if array_length(p_ordered_user_ids, 1) is distinct from v_member_count
     or v_distinct_count is distinct from v_member_count then
    raise exception 'Order must include every league member exactly once';
  end if;

  if exists (
    select 1 from unnest(p_ordered_user_ids) as u
    where not exists (
      select 1 from public.league_members lm
      where lm.league_id = p_league_id and lm.user_id = u
    )
  ) then
    raise exception 'Order includes someone who is not a member of this league';
  end if;

  foreach v_user_id in array p_ordered_user_ids loop
    update public.league_members
    set draft_position = v_position
    where league_id = p_league_id and user_id = v_user_id;
    v_position := v_position + 1;
  end loop;
end;
$$;

-- The 'custom' counterpart to set_draft_order: the whole pick-by-pick
-- sequence rather than just round one, so a commissioner can hand-balance a
-- lopsided cast (snake pairs pick i with pick 2N+1-i, which punishes the end
-- seats once it is obvious which couples are worthless). Stored whole because
-- there is no per-round rule to derive it from.
--
-- Round count is roster_size, which start_draft only derives at the moment
-- the draft begins, so the exact length cannot be checked here — this
-- enforces "every member the same number of times" and start_draft enforces
-- "and that number is roster_size".
create function public.set_custom_draft_order(p_league_id uuid, p_user_ids uuid[])
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_league public.leagues;
  v_member_count int;
  v_picks_each int;
begin
  select * into v_league from public.leagues where id = p_league_id for update;

  if not found or not public.is_league_commissioner(p_league_id) then
    raise exception 'Only the commissioner can set the draft order';
  end if;

  if not exists (
    select 1 from public.scoring_settings
    where league_id = p_league_id and judges_score_category_enabled
  ) then
    raise exception 'Dance Card is not enabled for this league';
  end if;

  if v_league.draft_status <> 'not_started' then
    raise exception 'Draft order can only be set before the draft starts';
  end if;

  select count(*) into v_member_count from public.league_members where league_id = p_league_id;

  if coalesce(array_length(p_user_ids, 1), 0) = 0
     or coalesce(array_length(p_user_ids, 1), 0) % v_member_count <> 0 then
    raise exception 'Order must give every manager the same number of picks';
  end if;

  v_picks_each := array_length(p_user_ids, 1) / v_member_count;

  if exists (
    select 1 from public.league_members m
    where m.league_id = p_league_id
      and (select count(*) from unnest(p_user_ids) as u where u = m.user_id) <> v_picks_each
  ) then
    raise exception 'Order must give every manager the same number of picks';
  end if;

  if exists (
    select 1 from unnest(p_user_ids) as u
    where not exists (
      select 1 from public.league_members lm
      where lm.league_id = p_league_id and lm.user_id = u
    )
  ) then
    raise exception 'Order includes someone who is not a member of this league';
  end if;

  update public.leagues
  set draft_type = 'custom',
      custom_pick_order = p_user_ids
  where id = p_league_id;
end;
$$;

create function public.start_draft(p_league_id uuid)
returns public.leagues
language plpgsql
security definer set search_path = ''
as $$
declare
  v_league public.leagues;
  v_member_count int;
  v_couple_count int;
  v_roster_size int;
  v_calibrated_multiplier numeric;
begin
  select * into v_league from public.leagues where id = p_league_id for update;

  if not found or not public.is_league_commissioner(p_league_id) then
    raise exception 'Only the commissioner can start the draft';
  end if;

  if not exists (
    select 1 from public.scoring_settings
    where league_id = p_league_id and judges_score_category_enabled
  ) then
    raise exception 'Dance Card is not enabled for this league';
  end if;

  if v_league.draft_status <> 'not_started' then
    raise exception 'Draft has already been started';
  end if;

  select count(*) into v_member_count from public.league_members where league_id = p_league_id;
  if v_member_count < 2 then
    raise exception 'Need at least 2 members to start the draft';
  end if;

  if exists (
    select 1 from public.league_members
    where league_id = p_league_id and draft_position is null
  ) then
    raise exception 'Draft order has not been set for all members yet';
  end if;

  -- Only active couples: record_draft_pick rejects anyone else, so counting
  -- an already-eliminated couple would size rosters for picks that can never
  -- be made and leave the draft one pick short of complete.
  select count(*) into v_couple_count
  from public.couples
  where season_id = public.active_season_id() and status = 'active';
  if v_member_count > v_couple_count then
    raise exception 'Not enough couples for every member to get at least one';
  end if;

  -- roster_size is the even split (integer division), computed here rather
  -- than commissioner-set. Any remainder couples are left undrafted for the
  -- season rather than handed out unevenly. current_turn_started_at starts
  -- the first pick clock; this function never places a pick.
  v_roster_size := v_couple_count / v_member_count;

  -- A custom order is a full pick-by-pick sequence, so it can only be checked
  -- here, where roster_size (and therefore the round count) first exists.
  -- Membership or the active cast may have moved since it was set.
  if v_league.draft_type = 'custom' then
    if coalesce(array_length(v_league.custom_pick_order, 1), 0) <> v_member_count * v_roster_size then
      raise exception 'Custom draft order does not cover every pick — set it again in the draft lobby';
    end if;

    if exists (
      select 1 from public.league_members m
      where m.league_id = p_league_id
        and (select count(*) from unnest(v_league.custom_pick_order) as u where u = m.user_id)
            <> v_roster_size
    ) then
      raise exception 'Custom draft order must give every manager exactly % picks', v_roster_size;
    end if;
  end if;

  update public.leagues
  set draft_status = 'in_progress',
      roster_size = v_roster_size,
      current_turn_started_at = now()
  where id = p_league_id
  returning * into v_league;

  -- Seed judges_score_multiplier from the roster-size-keyed calibration
  -- table now that roster_size is fixed for the season — but only while the
  -- commissioner hasn't customized it themselves (see
  -- judges_score_multiplier_customized on scoring_settings). Clamp to the
  -- nearest defined roster size if this season's split falls outside the
  -- table's swept range.
  select judges_score_multiplier_default into v_calibrated_multiplier
  from public.dance_card_calibration
  where roster_size = (
    select roster_size from public.dance_card_calibration
    order by abs(roster_size - v_roster_size), roster_size
    limit 1
  );

  if v_calibrated_multiplier is not null then
    update public.scoring_settings
    set judges_score_multiplier = v_calibrated_multiplier
    where league_id = p_league_id and not judges_score_multiplier_customized;
  end if;

  return v_league;
end;
$$;

revoke execute on function public.set_draft_order(uuid, uuid[]) from public;
grant execute on function public.set_draft_order(uuid, uuid[]) to authenticated;

-- Internal: caller must already hold the leagues row lock. Enforces whose
-- turn it is, couple eligibility, insert, clock reset, and completion.
create function public.record_draft_pick(
  p_league_id uuid,
  p_couple_id uuid,
  p_manager_id uuid,
  p_auto_source text
)
returns public.draft_picks
language plpgsql
security definer set search_path = ''
as $$
declare
  v_league public.leagues;
  v_member_count int;
  v_total_slots int;
  v_next_pick int;
  v_round int;
  v_position_in_round int;
  v_draft_position_needed int;
  v_expected_manager uuid;
  v_pick public.draft_picks;
begin
  select * into v_league from public.leagues where id = p_league_id;

  if not found then
    raise exception 'League not found';
  end if;

  if not exists (
    select 1 from public.scoring_settings
    where league_id = p_league_id and judges_score_category_enabled
  ) then
    raise exception 'Dance Card is not enabled for this league';
  end if;

  if v_league.draft_status <> 'in_progress' then
    raise exception 'Draft is not in progress';
  end if;

  select count(*) into v_member_count from public.league_members where league_id = p_league_id;
  v_total_slots := v_member_count * v_league.roster_size;
  v_next_pick := (select count(*) from public.draft_picks where league_id = p_league_id) + 1;

  if v_next_pick > v_total_slots then
    raise exception 'Draft is already complete';
  end if;

  v_round := ((v_next_pick - 1) / v_member_count) + 1;
  v_position_in_round := v_next_pick - (v_round - 1) * v_member_count;

  -- Custom order names the manager for each pick outright; snake goes 1..N on
  -- odd rounds and N..1 on even ones; linear repeats 1..N every round.
  if v_league.draft_type = 'custom' then
    v_expected_manager := v_league.custom_pick_order[v_next_pick];
  else
    if v_league.draft_type = 'linear' or v_round % 2 = 1 then
      v_draft_position_needed := v_position_in_round;
    else
      v_draft_position_needed := v_member_count - v_position_in_round + 1;
    end if;

    select user_id into v_expected_manager
    from public.league_members
    where league_id = p_league_id and draft_position = v_draft_position_needed;
  end if;

  if v_expected_manager is null or v_expected_manager <> p_manager_id then
    raise exception 'It is not your turn to pick';
  end if;

  if not exists (
    select 1 from public.couples where id = p_couple_id and season_id = public.active_season_id()
  ) then
    raise exception 'That couple is not part of the current season';
  end if;

  if exists (
    select 1 from public.couples where id = p_couple_id and status <> 'active'
  ) then
    raise exception 'That couple is not available';
  end if;

  if exists (select 1 from public.draft_picks where league_id = p_league_id and couple_id = p_couple_id) then
    raise exception 'That couple has already been drafted';
  end if;

  insert into public.draft_picks (league_id, couple_id, manager_id, round, pick_number, is_auto, auto_source)
  values (p_league_id, p_couple_id, p_manager_id, v_round, v_next_pick, p_auto_source is not null, p_auto_source)
  returning * into v_pick;

  if v_next_pick = v_total_slots then
    update public.leagues
    set draft_status = 'completed', current_turn_started_at = now()
    where id = p_league_id;

    insert into public.roster_slots (league_id, manager_id, slot_number, couple_id, source, start_week)
    select league_id, manager_id, row_number() over (partition by manager_id order by pick_number), couple_id, 'draft', 1
    from public.draft_picks
    where league_id = p_league_id;

    -- Freezes the auto-advanced Hard Deadline (effective_hard_deadline_week)
    -- into judges_score_starts_week now that the draft has actually
    -- completed, so a real roster exists from this point on.
    update public.scoring_settings
    set judges_score_starts_week = greatest(
      judges_score_starts_week,
      coalesce(
        (select min(w.week_number)
         from public.competition_weeks w
         where w.season_id = public.active_season_id()
           and (select min(e.airs_at) from public.episodes e where e.week_id = w.id) > now()),
        judges_score_starts_week
      )
    )
    where league_id = p_league_id;
  else
    -- Fresh clock for the next manager so one timeout cannot drain the board.
    update public.leagues
    set current_turn_started_at = now()
    where id = p_league_id;
  end if;

  return v_pick;
end;
$$;

revoke execute on function public.record_draft_pick(uuid, uuid, uuid, text) from public, authenticated;

create function public.make_draft_pick(p_league_id uuid, p_couple_id uuid)
returns public.draft_picks
language plpgsql
security definer set search_path = ''
as $$
declare
  v_league public.leagues;
  v_acting_manager uuid;
begin
  -- Serialize concurrent picks on this league (same lock auto-pick takes).
  select * into v_league from public.leagues where id = p_league_id for update;
  if not found then
    raise exception 'League not found';
  end if;

  v_acting_manager := public.resolve_acting_league_member(p_league_id);
  if v_acting_manager is null then
    raise exception 'It is not your turn to pick';
  end if;

  return public.record_draft_pick(p_league_id, p_couple_id, v_acting_manager, null);
end;
$$;

-- Places one uniformly-random eligible remaining couple for the manager on
-- the clock. Any league member may call this so a started draft still moves
-- when the picker never joined the room. Eligible when that manager has
-- draft_autopilot or the server pick clock has expired. One pick per call —
-- the next manager gets a fresh clock (unless they are also on autopilot).
-- Does not start a draft.
create function public.make_auto_draft_pick(p_league_id uuid)
returns public.draft_picks
language plpgsql
security definer set search_path = ''
as $$
declare
  v_league public.leagues;
  v_member_count int;
  v_total_slots int;
  v_next_pick int;
  v_round int;
  v_position_in_round int;
  v_draft_position_needed int;
  v_expected_manager uuid;
  v_autopilot boolean;
  v_turn_started timestamptz;
  v_couple_id uuid;
  v_auto_source text;
begin
  if not public.is_league_member(p_league_id) then
    raise exception 'You are not a member of this league';
  end if;

  select * into v_league from public.leagues where id = p_league_id for update;

  if not found then
    raise exception 'League not found';
  end if;

  if v_league.draft_status <> 'in_progress' then
    raise exception 'Draft is not in progress';
  end if;

  select count(*) into v_member_count from public.league_members where league_id = p_league_id;
  v_total_slots := v_member_count * v_league.roster_size;
  v_next_pick := (select count(*) from public.draft_picks where league_id = p_league_id) + 1;

  if v_next_pick > v_total_slots then
    raise exception 'Draft is already complete';
  end if;

  v_round := ((v_next_pick - 1) / v_member_count) + 1;
  v_position_in_round := v_next_pick - (v_round - 1) * v_member_count;

  if v_league.draft_type = 'custom' then
    v_expected_manager := v_league.custom_pick_order[v_next_pick];

    select draft_autopilot into v_autopilot
    from public.league_members
    where league_id = p_league_id and user_id = v_expected_manager;
  else
    if v_league.draft_type = 'linear' or v_round % 2 = 1 then
      v_draft_position_needed := v_position_in_round;
    else
      v_draft_position_needed := v_member_count - v_position_in_round + 1;
    end if;

    select user_id, draft_autopilot
      into v_expected_manager, v_autopilot
    from public.league_members
    where league_id = p_league_id and draft_position = v_draft_position_needed;
  end if;

  if v_expected_manager is null then
    raise exception 'It is not your turn to pick';
  end if;

  v_turn_started := coalesce(v_league.current_turn_started_at, now());
  if not coalesce(v_autopilot, false)
     and now() < v_turn_started + (v_league.pick_time_limit_seconds * interval '1 second') then
    raise exception 'Not eligible for an auto-pick yet';
  end if;

  -- The on-the-clock manager's own queue first (definer bypasses its
  -- owner-only RLS): highest-ranked couple still active and undrafted.
  select c.id into v_couple_id
  from public.draft_queues q
  cross join lateral unnest(q.couple_ids) with ordinality as u(couple_id, pos)
  join public.couples c on c.id = u.couple_id
  where q.league_id = p_league_id
    and q.user_id = v_expected_manager
    and c.season_id = public.active_season_id()
    and c.status = 'active'
    and not exists (
      select 1 from public.draft_picks dp
      where dp.league_id = p_league_id and dp.couple_id = c.id
    )
  order by u.pos
  limit 1;

  v_auto_source := 'queue';

  if v_couple_id is null then
    v_auto_source := 'random';

    select c.id into v_couple_id
    from public.couples c
    where c.season_id = public.active_season_id()
      and c.status = 'active'
      and not exists (
        select 1 from public.draft_picks dp
        where dp.league_id = p_league_id and dp.couple_id = c.id
      )
    order by random()
    limit 1;
  end if;

  if v_couple_id is null then
    raise exception 'No eligible couples remaining';
  end if;

  return public.record_draft_pick(p_league_id, v_couple_id, v_expected_manager, v_auto_source);
end;
$$;

create function public.set_draft_autopilot(p_league_id uuid, p_enabled boolean)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  v_acting_manager uuid;
begin
  v_acting_manager := public.resolve_acting_league_member(p_league_id);
  if v_acting_manager is null then
    raise exception 'You are not a member of this league';
  end if;

  if exists (
    select 1 from public.leagues
    where id = p_league_id and draft_status = 'completed'
  ) then
    raise exception 'Draft is already over';
  end if;

  update public.league_members
  set draft_autopilot = p_enabled
  where league_id = p_league_id and user_id = v_acting_manager;

  if not found then
    raise exception 'You are not a member of this league';
  end if;

  return p_enabled;
end;
$$;

-- Saves the caller's own auto-pick queue. Allowed before and during the draft.
-- Drafted or since-eliminated couples may linger in it; make_auto_draft_pick
-- skips them, so only season membership and uniqueness are enforced here.
create function public.set_draft_queue(p_league_id uuid, p_couple_ids uuid[])
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_acting_manager uuid;
begin
  v_acting_manager := public.resolve_acting_league_member(p_league_id);
  if v_acting_manager is null then
    raise exception 'You are not a member of this league';
  end if;

  if exists (
    select 1 from public.leagues
    where id = p_league_id and draft_status = 'completed'
  ) then
    raise exception 'Draft is already over';
  end if;

  if (select count(distinct u) from unnest(p_couple_ids) as u)
     is distinct from coalesce(array_length(p_couple_ids, 1), 0) then
    raise exception 'A couple can only be in your queue once';
  end if;

  if exists (
    select 1 from unnest(p_couple_ids) as u
    where not exists (
      select 1 from public.couples c
      where c.id = u and c.season_id = public.active_season_id()
    )
  ) then
    raise exception 'Queue includes a couple that is not part of the current season';
  end if;

  insert into public.draft_queues (league_id, user_id, couple_ids)
  values (p_league_id, v_acting_manager, p_couple_ids)
  on conflict (league_id, user_id) do update set couple_ids = excluded.couple_ids;
end;
$$;

-- Commissioner-only undo of the single most recent pick (manual or auto), and
-- only while the draft is still in progress (roster_slots have not been
-- seeded). Repeat to step back further.
create function public.undo_last_pick(p_league_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_league public.leagues;
  v_pick public.draft_picks;
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Only the commissioner can undo a pick';
  end if;

  select * into v_league from public.leagues where id = p_league_id for update;

  if not found then
    raise exception 'League not found';
  end if;

  if v_league.draft_status <> 'in_progress' then
    raise exception 'Can only undo a pick while the draft is in progress';
  end if;

  select * into v_pick
  from public.draft_picks
  where league_id = p_league_id
  order by pick_number desc
  limit 1
  for update;

  if not found then
    raise exception 'No picks to undo';
  end if;

  delete from public.draft_picks where id = v_pick.id;

  update public.leagues
  set current_turn_started_at = now()
  where id = p_league_id;
end;
$$;

-- Commissioner-only sit-out toggle for any member, for the manager who walked
-- away mid-draft. Same flag a manager sets on themselves via
-- set_draft_autopilot.
create function public.set_member_draft_autopilot(
  p_league_id uuid,
  p_user_id uuid,
  p_enabled boolean
)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Only the commissioner can set autopilot for another member';
  end if;

  if exists (
    select 1 from public.leagues
    where id = p_league_id and draft_status = 'completed'
  ) then
    raise exception 'Draft is already over';
  end if;

  update public.league_members
  set draft_autopilot = p_enabled
  where league_id = p_league_id and user_id = p_user_id;

  if not found then
    raise exception 'That person is not a member of this league';
  end if;

  return p_enabled;
end;
$$;

-- Commissioner-only full wipe of the draft, in progress or completed. Deletes
-- the picks, the rosters seeded from them (including waiver moves), and the
-- weekly scores computed from those rosters, then returns the league to
-- not_started. Keeps draft_position / draft_autopilot (one click to restart),
-- predictions, and scoring settings — including the frozen
-- judges_score_starts_week, a floor so a redraft can't score weeks that
-- already aired. judges_score_multiplier re-derives at the next start_draft.
create function public.reset_draft(p_league_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_league public.leagues;
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Only the commissioner can reset the draft';
  end if;

  select * into v_league from public.leagues where id = p_league_id for update;

  if not found then
    raise exception 'League not found';
  end if;

  if v_league.draft_status = 'not_started' then
    raise exception 'The draft has not started';
  end if;

  delete from public.weekly_manager_scores where league_id = p_league_id;
  delete from public.waiver_claims where league_id = p_league_id;
  delete from public.roster_slots where league_id = p_league_id;
  delete from public.draft_picks where league_id = p_league_id;

  update public.leagues
  set draft_status = 'not_started',
      current_turn_started_at = null
  where id = p_league_id;
end;
$$;

revoke execute on function public.start_draft(uuid) from public;
revoke execute on function public.make_draft_pick(uuid, uuid) from public;
revoke execute on function public.make_auto_draft_pick(uuid) from public;
revoke execute on function public.set_draft_autopilot(uuid, boolean) from public;
revoke execute on function public.set_custom_draft_order(uuid, uuid[]) from public;
revoke execute on function public.set_draft_queue(uuid, uuid[]) from public;
revoke execute on function public.undo_last_pick(uuid) from public;
revoke execute on function public.set_member_draft_autopilot(uuid, uuid, boolean) from public;
revoke execute on function public.reset_draft(uuid) from public;
grant execute on function public.start_draft(uuid) to authenticated;
grant execute on function public.make_draft_pick(uuid, uuid) to authenticated;
grant execute on function public.make_auto_draft_pick(uuid) to authenticated;
grant execute on function public.set_draft_autopilot(uuid, boolean) to authenticated;
grant execute on function public.set_custom_draft_order(uuid, uuid[]) to authenticated;
grant execute on function public.set_draft_queue(uuid, uuid[]) to authenticated;
grant execute on function public.undo_last_pick(uuid) to authenticated;
grant execute on function public.set_member_draft_autopilot(uuid, uuid, boolean) to authenticated;
grant execute on function public.reset_draft(uuid) to authenticated;

alter publication supabase_realtime add table public.leagues;
alter publication supabase_realtime add table public.league_members;
alter publication supabase_realtime add table public.draft_picks;

-- ============================================================
-- Results entry: episodes/dance_scores/episode_results are global (like
-- couples) and readable by every authenticated user. weekly_manager_scores
-- is league-scoped like everything else in a league.
--
-- The actual write path (episodes, dance_scores, episode_results, couples
-- status, weekly_manager_scores) is NOT exposed via RLS/grants at all —
-- results entry is a cross-league admin operation (one submission recomputes
-- scores for every league that has relevant rosters/predictions), so it runs
-- server-side via the service_role key after an authorization check in
-- application code (profiles.is_super_admin, or the RESULTS_ENTRY_OPEN_TO_ALL
-- env toggle — see src/lib/results.ts), rather than through a SECURITY
-- DEFINER function.
-- ============================================================

-- Draft/Publish staging tables for results entry. No grants, no RLS policy
-- at all — default-deny, service-role only. Access to /admin/results is
-- already gated server-side (is_super_admin, or the
-- RESULTS_ENTRY_OPEN_TO_ALL env flag an RLS policy can't see), so draft
-- reads/writes go through the service-role client from code that already
-- passed that check — the same trust boundary the live write path below
-- already uses, just extended to reads for these new tables. A draft is
-- promoted into the live tables (dance_scores/judge_scores/episode_results)
-- by publishEpisodeDraft, then deleted from here — these never carry
-- long-term history, only the in-progress week.
create table draft_episode_overrides (
  episode_id uuid primary key references episodes(id) on delete cascade,
  guest_judge_name text,
  judges_save_available boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null
);

create table draft_dance_scores (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references episodes(id) on delete cascade,
  couple_id uuid not null references couples(id),
  dance_style_id uuid not null references dance_styles(id),
  song_title text,
  total_score numeric not null default 0,
  created_at timestamptz not null default now()
);

create table draft_judge_scores (
  id uuid primary key default gen_random_uuid(),
  draft_dance_score_id uuid not null references draft_dance_scores(id) on delete cascade,
  judge_id uuid not null references people(id),
  score numeric not null,
  unique (draft_dance_score_id, judge_id)
);

create table draft_episode_results (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references episodes(id) on delete cascade,
  couple_id uuid not null references couples(id),
  outcome text not null check (outcome in ('safe', 'eliminated', 'withdrawn', 'bye', 'winner', 'runner_up', 'third_place')),
  was_bottom_two boolean not null default false,
  was_bottom_three boolean not null default false,
  saved_by_judges boolean not null default false,
  had_immunity boolean not null default false,
  bonus_points numeric not null default 0,
  bonus_note text,
  unique (episode_id, couple_id)
);

-- draft_episode_overrides' presence/absence for an episode is itself the
-- "has a draft been started" signal (see deriveResultsStatus in
-- src/lib/results-status.ts), and its updated_at drives "Draft saved N
-- minutes ago."
create table draft_episode_custom_moments (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references episodes(id) on delete cascade,
  couple_id uuid references couples(id),
  label text not null,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id) on delete set null
);

create index idx_draft_dance_scores_episode on draft_dance_scores(episode_id);
create index idx_draft_episode_results_episode on draft_episode_results(episode_id);
create index idx_draft_custom_moments_episode on draft_episode_custom_moments(episode_id);

grant select on public.episodes to authenticated;
create policy "episodes are viewable by all authenticated users"
on public.episodes for select
using (true);

grant select on public.dance_styles to authenticated;
create policy "dance styles are viewable by all authenticated users"
on public.dance_styles for select
using (true);

grant select on public.round_types to authenticated;
create policy "round types are viewable by all authenticated users"
on public.round_types for select
using (true);

grant select on public.dance_scores to authenticated;
create policy "dance scores are viewable by all authenticated users"
on public.dance_scores for select
using (true);

grant select on public.judge_scores to authenticated;
create policy "judge scores are viewable by all authenticated users"
on public.judge_scores for select
using (true);

grant select on public.episode_results to authenticated;
create policy "episode results are viewable by all authenticated users"
on public.episode_results for select
using (true);

-- Published "Special Moments" custom pills (Perfect Score/Judges' Save are
-- computed at render time, not stored — this table is only for the
-- manually-added ones). Same trust level as dance_scores/episode_results
-- above: global, world-readable-to-authenticated, written only by the
-- service-role results-entry path.
create table episode_custom_moments (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references episodes(id) on delete cascade,
  couple_id uuid references couples(id),
  label text not null,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id) on delete set null
);

grant select on public.episode_custom_moments to authenticated;
create policy "episode custom moments are viewable by all authenticated users"
on public.episode_custom_moments for select
using (true);

-- Explicit "who actually performed in this episode." No row for an episode
-- means unrestricted (every currently-active couple participates) — this is
-- only ever populated for a split-broadcast episode (e.g. a two-night
-- premiere where half the cast dances each night), never for an ordinary
-- week. Same trust level as episode_custom_moments above: written only by
-- the service-role results-entry path (applyEpisodeSchedule).
create table episode_participants (
  episode_id uuid not null references episodes(id) on delete cascade,
  couple_id uuid not null references couples(id),
  created_at timestamptz not null default now(),
  primary key (episode_id, couple_id)
);

create index idx_episode_participants_episode on episode_participants(episode_id);

-- Which round types this airing uses. Mirrors episode_participants: composite
-- PK, cascade from the episode, readable by every authenticated user, written
-- only by the service-role schedule path (applyEpisodeSchedule).
create table episode_round_types (
  episode_id uuid not null references episodes(id) on delete cascade,
  round_type_id uuid not null references round_types(id),
  created_at timestamptz not null default now(),
  primary key (episode_id, round_type_id)
);

create index idx_episode_round_types_episode on episode_round_types(episode_id);

grant select on public.episode_participants to authenticated;
create policy "episode participants are viewable by all authenticated users"
on public.episode_participants for select
using (true);

grant select on public.episode_round_types to authenticated;
create policy "episode round types are viewable by all authenticated users"
on public.episode_round_types for select
using (true);

grant select on public.weekly_manager_scores to authenticated;
create policy "weekly manager scores are viewable by league members"
on public.weekly_manager_scores for select
using (public.is_league_member(league_id));

-- ============================================================
-- Weekly Pick 'Em: submitting/updating a prediction is a SECURITY DEFINER
-- function (same shape as make_draft_pick) so the lock deadline is enforced
-- server-side, not just hidden in the UI. Reads are more specific than the
-- usual "viewable by league members" pattern: a manager's own pick is only
-- visible to them until the episode locks, then it's visible league-wide —
-- otherwise seeing a league-mate's elimination pick before lock would let you
-- just copy their guess.
-- ============================================================

grant select on public.predictions to authenticated;

-- Each league locks relative to the same real first-airs_at of the
-- competition week, just with its own configurable lead time
-- (leagues.prediction_lock_hours_before_air) — so the lock moment isn't a
-- single column anywhere, it's computed. Shared by the RLS policy below and
-- submit_prediction so the two can't drift apart. Multi-night weeks lock
-- before Night One.
-- Lock hours must be a scalar subquery: min(airs_at) minus a joined
-- leagues.prediction_lock_hours_before_air is 42803 (must GROUP BY).
create function public.prediction_lock_at(p_league_id uuid, p_week_id uuid)
returns timestamptz
language sql
security definer
set search_path = ''
stable
as $$
  select min(e.airs_at) - (
    (select l.prediction_lock_hours_before_air
     from public.leagues l
     where l.id = p_league_id) * interval '1 hour'
  )
  from public.episodes e
  where e.week_id = p_week_id;
$$;

revoke execute on function public.prediction_lock_at(uuid, uuid) from public;
grant execute on function public.prediction_lock_at(uuid, uuid) to authenticated;

-- A single per-league "Hard Deadline," pinned to a real episode via
-- judges_score_starts_week (no new column) — it's where the Grand Finale
-- deadline (effective_grand_finale_deadline below) is pinned to, and where
-- Judges' Score starts counting from. The draft is expected to finish by it
-- but isn't hard-blocked: if the draft is still open when that episode
-- airs, the *effective* deadline auto-advances to the next not-yet-aired
-- episode (this function), and make_draft_pick freezes that advanced value
-- into judges_score_starts_week once the draft actually completes.
-- The whole auto-advance/freeze dance only exists to protect an in-progress
-- draft — a league with Dance Card off never has one (draft_status stays
-- 'not_started' forever), so it's treated the same as an already-completed
-- draft: just the plain judges_score_starts_week value, no rolling forward.
create function public.effective_hard_deadline_week(p_league_id uuid)
returns int
language sql
security definer
set search_path = ''
stable
as $$
  select case
    when l.draft_status = 'completed' or not ss.judges_score_category_enabled then ss.judges_score_starts_week
    else greatest(
      ss.judges_score_starts_week,
      coalesce(
        (select min(w.week_number)
         from public.competition_weeks w
         where w.season_id = public.active_season_id()
           and (select min(e.airs_at) from public.episodes e where e.week_id = w.id) > now()),
        ss.judges_score_starts_week
      )
    )
  end
  from public.leagues l
  join public.scoring_settings ss on ss.league_id = l.id
  where l.id = p_league_id;
$$;

revoke execute on function public.effective_hard_deadline_week(uuid) from public;
grant execute on function public.effective_hard_deadline_week(uuid) to authenticated;

-- The Grand Finale deadline, fully derived from the Hard Deadline — no
-- commissioner-set value exists anymore (see the removed
-- scoring_settings.bonus_picks_deadline column). Returns null when that
-- week's episode isn't scheduled yet (e.g. right after league creation,
-- before Week 1 exists), which callers treat as "still locked."
create function public.effective_grand_finale_deadline(p_league_id uuid)
returns timestamptz
language sql
security definer
set search_path = ''
stable
as $$
  select min(e.airs_at)
  from public.episodes e
  join public.competition_weeks w on w.id = e.week_id
  where w.season_id = public.active_season_id()
    and w.week_number = public.effective_hard_deadline_week(p_league_id);
$$;

revoke execute on function public.effective_grand_finale_deadline(uuid) from public;
grant execute on function public.effective_grand_finale_deadline(uuid) to authenticated;

create policy "predictions visible to owner pre-lock, league post-lock"
on public.predictions for select
using (
  public.is_league_member(league_id)
  and (
    exists (
      select 1 from public.league_members
      where league_id = predictions.league_id
        and user_id = predictions.manager_id
        and (user_id = auth.uid() or co_manager_id = auth.uid())
    )
    or now() >= public.prediction_lock_at(league_id, week_id)
  )
);

create function public.submit_prediction(
  p_league_id uuid,
  p_week_id uuid,
  p_predicted_eliminated_couple_id uuid,
  p_predicted_eliminated_couple_id_2 uuid,
  p_predicted_top_scorer_couple_id uuid
)
returns public.predictions
language plpgsql
security definer set search_path = ''
as $$
declare
  v_lock_at timestamptz;
  v_is_double_elim boolean;
  v_prediction public.predictions;
  v_acting_manager uuid;
begin
  v_acting_manager := public.resolve_acting_league_member(p_league_id);
  if v_acting_manager is null then
    raise exception 'You are not a member of this league';
  end if;

  if not exists (
    select 1 from public.scoring_settings
    where league_id = p_league_id and eliminations_category_enabled
  ) then
    raise exception 'Curtain Call is not enabled for this league';
  end if;

  select is_double_elimination_week into v_is_double_elim
  from public.competition_weeks where id = p_week_id;

  if v_is_double_elim is null then
    raise exception 'Week not found';
  end if;

  if v_is_double_elim then
    if (p_predicted_eliminated_couple_id is null) <> (p_predicted_eliminated_couple_id_2 is null) then
      raise exception 'Pick both couples going home this week, or leave both blank to skip';
    end if;
    if p_predicted_eliminated_couple_id_2 is not null
       and p_predicted_eliminated_couple_id_2 = p_predicted_eliminated_couple_id then
      raise exception 'Pick two different couples for your double elimination guesses';
    end if;
  elsif p_predicted_eliminated_couple_id_2 is not null then
    raise exception 'This week is not a double elimination week';
  end if;

  v_lock_at := public.prediction_lock_at(p_league_id, p_week_id);

  if now() >= v_lock_at then
    raise exception 'Predictions are locked for this week';
  end if;

  insert into public.predictions (
    league_id, manager_id, week_id,
    predicted_eliminated_couple_id, predicted_eliminated_couple_id_2,
    predicted_top_scorer_couple_id
  )
  values (
    p_league_id, v_acting_manager, p_week_id,
    p_predicted_eliminated_couple_id, p_predicted_eliminated_couple_id_2,
    p_predicted_top_scorer_couple_id
  )
  on conflict (league_id, manager_id, week_id) do update set
    predicted_eliminated_couple_id = excluded.predicted_eliminated_couple_id,
    predicted_eliminated_couple_id_2 = excluded.predicted_eliminated_couple_id_2,
    predicted_top_scorer_couple_id = excluded.predicted_top_scorer_couple_id,
    submitted_at = now()
  returning * into v_prediction;

  return v_prediction;
end;
$$;

revoke execute on function public.submit_prediction(uuid, uuid, uuid, uuid, uuid) from public;
grant execute on function public.submit_prediction(uuid, uuid, uuid, uuid, uuid) to authenticated;

-- ============================================================
-- Grand Finale predictions: same "owner pre-lock, league-wide post-lock"
-- visibility as weekly predictions, but the lock moment is the single
-- effective_grand_finale_deadline() per league rather than one computed per
-- episode, so no separate lock_at function is needed.
-- ============================================================

grant select on public.grand_finale_predictions to authenticated;

create policy "grand finale predictions visible to owner pre-deadline, league post-deadline"
on public.grand_finale_predictions for select
using (
  public.is_league_member(league_id)
  and (
    exists (
      select 1 from public.league_members
      where league_id = grand_finale_predictions.league_id
        and user_id = grand_finale_predictions.manager_id
        and (user_id = auth.uid() or co_manager_id = auth.uid())
    )
    or now() >= public.effective_grand_finale_deadline(league_id)
  )
);

create function public.submit_grand_finale_prediction(p_league_id uuid, p_couple_ids uuid[])
returns setof public.grand_finale_predictions
language plpgsql
security definer set search_path = ''
as $$
declare
  v_deadline timestamptz;
  v_season_id uuid;
  v_expected_count int;
  v_acting_manager uuid;
begin
  v_acting_manager := public.resolve_acting_league_member(p_league_id);
  if v_acting_manager is null then
    raise exception 'You are not a member of this league';
  end if;

  if not exists (
    select 1 from public.scoring_settings
    where league_id = p_league_id and bonus_picks_category_enabled
  ) then
    raise exception 'Grand Finale is not enabled for this league';
  end if;

  v_deadline := public.effective_grand_finale_deadline(p_league_id);

  if v_deadline is null or now() >= v_deadline then
    raise exception 'Grand Finale predictions are locked';
  end if;

  v_season_id := public.active_season_id();

  select count(*) into v_expected_count from public.couples where season_id = v_season_id;

  if array_length(p_couple_ids, 1) is distinct from v_expected_count
     or (select count(distinct c) from unnest(p_couple_ids) as c) is distinct from v_expected_count
  then
    raise exception 'Prediction must include every couple this season, exactly once';
  end if;

  if exists (
    select 1 from unnest(p_couple_ids) as c
    where not exists (select 1 from public.couples where id = c and season_id = v_season_id)
  ) then
    raise exception 'Prediction includes a couple not in the current season';
  end if;

  delete from public.grand_finale_predictions
  where league_id = p_league_id and manager_id = v_acting_manager;

  return query
  insert into public.grand_finale_predictions (league_id, manager_id, couple_id, predicted_position)
  select p_league_id, v_acting_manager, c, ordinality
  from unnest(p_couple_ids) with ordinality as t(c, ordinality)
  returning *;
end;
$$;

revoke execute on function public.submit_grand_finale_prediction(uuid, uuid[]) from public;
grant execute on function public.submit_grand_finale_prediction(uuid, uuid[]) to authenticated;

-- ============================================================
-- Waivers. roster_slots is a timeline: a slot's *current* occupancy is the
-- row with end_week is null; a slot is "open" when that current row's couple
-- has been eliminated. Claiming closes the old row (end_week = the claim's
-- week_number) and inserts a new one (source 'waiver', start_week = that
-- week + 1) — so the new couple starts scoring the following week, and nothing
-- ever needs a null couple_id.
--
-- grant select on roster_slots was missing entirely before this phase — the
-- Phase 6 roster card has been silently getting a permission-denied error
-- and rendering nothing, since its query result was never checked for error.
-- ============================================================

grant select on public.roster_slots to authenticated;
create policy "roster slots are viewable by league members"
on public.roster_slots for select
using (public.is_league_member(league_id));

drop index if exists idx_roster_slots_open;

grant select on public.waiver_claims to authenticated;
create policy "waiver claims are viewable by league members"
on public.waiver_claims for select
using (public.is_league_member(league_id));

-- Internal-only: does the actual roster swap + bookkeeping once a claim is
-- decided. No permission check of its own — every caller below has already
-- verified the caller is allowed to decide this claim before calling it.
create function public.finalize_waiver_claim(p_claim_id uuid)
returns public.waiver_claims
language plpgsql
security definer set search_path = ''
as $$
declare
  v_claim public.waiver_claims;
begin
  select * into v_claim from public.waiver_claims where id = p_claim_id for update;
  if not found then
    raise exception 'Recast not found';
  end if;

  update public.roster_slots
  set end_week = v_claim.week_number
  where league_id = v_claim.league_id
    and manager_id = v_claim.manager_id
    and slot_number = v_claim.slot_number
    and end_week is null;

  insert into public.roster_slots (league_id, manager_id, slot_number, couple_id, source, start_week)
  values (v_claim.league_id, v_claim.manager_id, v_claim.slot_number, v_claim.couple_id, 'waiver', v_claim.week_number + 1);

  update public.waiver_claims
  set status = 'approved', resolved_at = now()
  where id = p_claim_id
  returning * into v_claim;

  -- Other pending claims for the same couple (lost the bidding) or the same
  -- manager+slot (can't fill one slot twice) are now moot.
  update public.waiver_claims
  set status = 'rejected', resolved_at = now()
  where id <> p_claim_id
    and status = 'pending'
    and league_id = v_claim.league_id
    and (
      couple_id = v_claim.couple_id
      or (manager_id = v_claim.manager_id and slot_number = v_claim.slot_number)
    );

  return v_claim;
end;
$$;

revoke execute on function public.finalize_waiver_claim(uuid) from public, authenticated;

create function public.submit_waiver_claim(
  p_league_id uuid,
  p_slot_number int,
  p_couple_id uuid
)
returns public.waiver_claims
language plpgsql
security definer set search_path = ''
as $$
declare
  v_league public.leagues;
  v_current_week int;
  v_claim public.waiver_claims;
  v_acting_manager uuid;
begin
  v_acting_manager := public.resolve_acting_league_member(p_league_id);
  if v_acting_manager is null then
    raise exception 'You are not a member of this league';
  end if;

  -- Locks the league for the rest of this call, serializing concurrent
  -- claims for the same league so two FCFS claims for the same couple can't
  -- both see it as "available" at once.
  select * into v_league from public.leagues where id = p_league_id for update;

  if not exists (
    select 1 from public.scoring_settings
    where league_id = p_league_id and judges_score_category_enabled
  ) then
    raise exception 'Dance Card is not enabled for this league';
  end if;

  if v_league.waiver_mode <> 'waivers' then
    raise exception 'This league does not use Recast';
  end if;

  if not exists (
    select 1 from public.roster_slots rs
    join public.couples c on c.id = rs.couple_id
    where rs.league_id = p_league_id
      and rs.manager_id = v_acting_manager
      and rs.slot_number = p_slot_number
      and rs.end_week is null
      and c.status in ('eliminated', 'withdrawn')
  ) then
    raise exception 'That slot is not open for a recast';
  end if;

  if not exists (
    select 1 from public.couples
    where id = p_couple_id and status = 'active' and season_id = public.active_season_id()
  ) then
    raise exception 'That couple is not available';
  end if;

  if exists (
    select 1 from public.roster_slots
    where league_id = p_league_id and couple_id = p_couple_id and end_week is null
  ) then
    raise exception 'That couple is already on a roster in this league';
  end if;

  v_current_week := coalesce((
    select max(w.week_number)
    from public.competition_weeks w
    where w.season_id = public.active_season_id()
      and not exists (
        select 1 from public.episodes e
        where e.week_id = w.id and e.status <> 'completed'
      )
      and exists (
        select 1 from public.episodes e where e.week_id = w.id
      )
  ), 0);

  insert into public.waiver_claims (league_id, couple_id, manager_id, slot_number, week_number, status)
  values (p_league_id, p_couple_id, v_acting_manager, p_slot_number, v_current_week, 'pending')
  returning * into v_claim;

  -- FCFS resolves immediately; reverse_standings/manual stay pending for the
  -- commissioner to process (the other bidders for the same couple aren't
  -- known yet, so there's nothing to compare against right now).
  if v_league.waiver_claim_method = 'fcfs' then
    return public.finalize_waiver_claim(v_claim.id);
  end if;

  return v_claim;
end;
$$;

revoke execute on function public.submit_waiver_claim(uuid, int, uuid) from public;
grant execute on function public.submit_waiver_claim(uuid, int, uuid) to authenticated;

create function public.process_reverse_standings_waivers(p_league_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_league public.leagues;
  v_couple_id uuid;
  v_winning_claim_id uuid;
begin
  select * into v_league from public.leagues where id = p_league_id for update;

  if not found or not public.is_league_commissioner(p_league_id) then
    raise exception 'Only the commissioner can process recasts';
  end if;

  if v_league.waiver_claim_method <> 'reverse_standings' then
    raise exception 'This league does not use reverse-standings recasts';
  end if;

  for v_couple_id in
    select distinct couple_id from public.waiver_claims
    where league_id = p_league_id and status = 'pending'
  loop
    -- Lowest season total wins the couple; ties go to whoever claimed first.
    -- A couple's claims can already be gone by the time we get here (a
    -- manager's other pending claim for the same slot may have just been
    -- auto-rejected by finalize_waiver_claim earlier in this same loop).
    select wc.id into v_winning_claim_id
    from public.waiver_claims wc
    left join (
      select manager_id, coalesce(sum(total_points), 0) as points
      from public.weekly_manager_scores
      where league_id = p_league_id
      group by manager_id
    ) totals on totals.manager_id = wc.manager_id
    where wc.league_id = p_league_id and wc.couple_id = v_couple_id and wc.status = 'pending'
    order by coalesce(totals.points, 0) asc, wc.created_at asc
    limit 1;

    if v_winning_claim_id is not null then
      perform public.finalize_waiver_claim(v_winning_claim_id);
    end if;
  end loop;
end;
$$;

revoke execute on function public.process_reverse_standings_waivers(uuid) from public;
grant execute on function public.process_reverse_standings_waivers(uuid) to authenticated;

create function public.approve_waiver_claim(p_claim_id uuid)
returns public.waiver_claims
language plpgsql
security definer set search_path = ''
as $$
declare
  v_claim public.waiver_claims;
begin
  select * into v_claim from public.waiver_claims where id = p_claim_id;
  if not found then
    raise exception 'Recast not found';
  end if;

  if not public.is_league_commissioner(v_claim.league_id) then
    raise exception 'Only the commissioner can approve recasts';
  end if;

  if v_claim.status <> 'pending' then
    raise exception 'This recast has already been resolved';
  end if;

  return public.finalize_waiver_claim(p_claim_id);
end;
$$;

create function public.reject_waiver_claim(p_claim_id uuid)
returns public.waiver_claims
language plpgsql
security definer set search_path = ''
as $$
declare
  v_claim public.waiver_claims;
begin
  select * into v_claim from public.waiver_claims where id = p_claim_id;
  if not found then
    raise exception 'Recast not found';
  end if;

  if not public.is_league_commissioner(v_claim.league_id) then
    raise exception 'Only the commissioner can reject recasts';
  end if;

  update public.waiver_claims
  set status = 'rejected', resolved_at = now()
  where id = p_claim_id
  returning * into v_claim;

  return v_claim;
end;
$$;

revoke execute on function public.approve_waiver_claim(uuid) from public;
revoke execute on function public.reject_waiver_claim(uuid) from public;
grant execute on function public.approve_waiver_claim(uuid) to authenticated;
grant execute on function public.reject_waiver_claim(uuid) to authenticated;

-- ============================================================
-- Spoiler-Free Mode: one high-water-mark row per (user, season) rather than
-- a per-episode log — DWTS publishes sequentially, so "watched through
-- Week 4" fully implies weeks 1-4 watched, with no real out-of-order case.
-- Keyed by season_id (not league_id) since watch progress tracks the
-- broadcast, not any one league. Filtering happens app-side (Server
-- Components), not via RLS here — episodes/couples/episode_results/
-- dance_scores/weekly_manager_scores stay world-readable-to-authenticated
-- because they're shared by reads that must always see true state (draft
-- board, waivers, Pick 'Em's couple picker); spoiler-safety is "protect the
-- user from an accidental glance," not a security boundary.
-- ============================================================

create table public.spoiler_watch_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  last_watched_week int not null default 0 check (last_watched_week >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, season_id)
);

grant select on public.spoiler_watch_progress to authenticated;

create policy "spoiler watch progress viewable by owner"
on public.spoiler_watch_progress for select
using (auth.uid() = user_id);

-- No insert/update grant — every write goes through the function below,
-- which does an atomic GREATEST upsert a plain client upsert can't express
-- without a read-then-write race that could regress progress.
create function public.mark_episodes_watched_through(p_week_number int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season_id uuid := public.active_season_id();
begin
  if v_season_id is null then
    raise exception 'No active season';
  end if;

  insert into public.spoiler_watch_progress (user_id, season_id, last_watched_week, updated_at)
  values (auth.uid(), v_season_id, p_week_number, now())
  on conflict (user_id, season_id)
  do update set
    last_watched_week = greatest(public.spoiler_watch_progress.last_watched_week, excluded.last_watched_week),
    updated_at = now();
end;
$$;

revoke execute on function public.mark_episodes_watched_through(int) from public;
grant execute on function public.mark_episodes_watched_through(int) to authenticated;
