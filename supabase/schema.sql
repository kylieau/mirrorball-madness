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
  -- App Store review requires (5.1.1(v)); an operator processes it by hand.
  deletion_requested_at timestamptz
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
  draft_type text not null default 'snake' check (draft_type in ('snake', 'linear')),
  pick_time_limit_seconds int not null default 90,
  draft_status text not null default 'not_started' check (draft_status in ('not_started', 'in_progress', 'completed')),
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
  joined_at timestamptz not null default now(),
  unique (league_id, user_id),
  unique (league_id, draft_position)
);

-- judges_score_multiplier..third_place_points: per-event point values within
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
-- judges_score_starts_week: the number of the first episode that counts
-- toward Judges' Scores — if the draft is deferred until after Week 1 airs,
-- Week 1 doesn't count (no roster existed yet). Points to any scheduled
-- episode, not capped at week 1 vs 2, so a late draft several weeks in
-- works the same way — the commissioner picks a real episode off the
-- schedule rather than typing a raw number.
--
-- bonus_picks_*: the season-long full-elimination-order prediction (made
-- once, tracked as weeks resolve). Only meaningful when
-- bonus_picks_category_enabled — see bonus_picks_config_required below for
-- what "configured" requires per scoring method.
create table scoring_settings (
  league_id uuid primary key references leagues(id) on delete cascade,
  judges_score_multiplier numeric not null default 1.0,
  survival_points numeric not null default 15,
  elimination_prediction_points numeric not null default 30, -- 0 disables
  top_scorer_prediction_points numeric not null default 20, -- 0 disables
  first_place_points numeric not null default 150,
  second_place_points numeric not null default 75,
  third_place_points numeric not null default 40,

  judges_score_category_enabled boolean not null default true,
  eliminations_category_enabled boolean not null default true,
  bonus_picks_category_enabled boolean not null default false,
  judges_score_category_weight numeric not null default 1,
  eliminations_category_weight numeric not null default 1,
  bonus_picks_category_weight numeric not null default 1,

  judges_score_starts_week int not null default 1 check (judges_score_starts_week > 0),

  bonus_picks_deadline timestamptz,
  bonus_picks_scoring_method text check (bonus_picks_scoring_method in ('exact_position', 'distance_based', 'binary_tier')),
  bonus_picks_distance_penalty numeric, -- points docked per position off; only used by 'distance_based'
  bonus_picks_tier_size int, -- e.g. 3 for "top 3"; only used by 'binary_tier'
  bonus_picks_points_per_correct numeric not null default 50, -- base value a correctly-placed couple earns

  -- Every new league gets this row with defaults on insert (create_league),
  -- but the commissioner never explicitly reviewed them until they save this
  -- form at least once. The league dashboard redirects a commissioner to
  -- Settings until this flips true, so scoring categories are a required
  -- creation step rather than silent defaults nobody looked at.
  scoring_configured boolean not null default false,

  constraint at_least_one_category_enabled check (
    judges_score_category_enabled or eliminations_category_enabled or bonus_picks_category_enabled
  ),
  constraint bonus_picks_config_required check (
    (not bonus_picks_category_enabled) or (
      bonus_picks_deadline is not null
      and bonus_picks_scoring_method is not null
      and (bonus_picks_scoring_method != 'distance_based' or bonus_picks_distance_penalty is not null)
      and (bonus_picks_scoring_method != 'binary_tier' or bonus_picks_tier_size is not null)
    )
  )
);

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
  unique (league_id, couple_id),
  unique (league_id, pick_number)
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
-- Episodes / weekly results
-- ============================================================

create table episodes (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id),
  week_number int not null, -- resets to 1 each season, so unique per-season below, not globally
  airs_at timestamptz not null, -- actual real-world air date/time; set per episode, not assumed weekly-regular
  theme text, -- e.g. "Villains Night" — free text, not a managed list; themes rarely repeat
  expected_dance_count int not null default 1, -- informational only, doesn't gate how many dances a couple can actually submit
  is_elimination_week boolean not null default true,
  is_finale boolean not null default false,
  -- Set ahead of air time on the Schedule tab. Gates Curtain Call's Pick 'Em
  -- to collecting two elimination guesses instead of one (submit_prediction
  -- enforces "0 or 2, never 1" filled slots) — results entry itself already
  -- supports any number of eliminations per episode with no flag needed.
  is_double_elimination_week boolean not null default false,
  status text not null default 'upcoming' check (status in ('upcoming', 'locked', 'completed')),
  -- guest_judge_name is free text, not a people(role='judge') row: people
  -- exists to unify recurring individuals across seasons (draft picks,
  -- judge_scores joins) — a guest judge is almost always a one-off with no
  -- scoring identity of their own. If a guest judge actually scores a
  -- dance, add them via the existing "Add judge" flow as a real people
  -- row; this column is purely the descriptive "who guest-judged" caption.
  guest_judge_name text,
  judges_save_available boolean not null default false,
  results_published_at timestamptz,
  results_published_by uuid references profiles(id) on delete set null,
  unique (season_id, week_number)
);

-- Admin-managed, extensible by the "add a dance style" admin form rather than
-- a code change (unlike Status/Note, a new dance style is pure labeling with
-- no scoring-logic implications, so there's nothing for it to be inconsistent
-- with).
create table dance_styles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

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
-- no-elimination weeks (insert zero 'eliminated' rows — see episodes.is_elimination_week
-- for the episode-level version of this). was_bottom_two/was_bottom_three/
-- saved_by_judges/was_team_dance/had_immunity are independent flags, not
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
  was_team_dance boolean not null default false,
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
  episode_id uuid not null references episodes(id),
  predicted_eliminated_couple_id uuid references couples(id),
  -- Only ever set on an episodes.is_double_elimination_week episode — both
  -- slots filled or both null, enforced in submit_prediction (a cross-table
  -- check isn't possible here). A normal week's predictions never touch it.
  predicted_eliminated_couple_id_2 uuid references couples(id),
  predicted_top_scorer_couple_id uuid references couples(id),
  submitted_at timestamptz not null default now(),
  unique (league_id, manager_id, episode_id),
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
  episode_id uuid not null references episodes(id),
  roster_points numeric not null default 0,
  prediction_points numeric not null default 0,
  -- This episode's incremental Grand Finale contribution only (couples whose
  -- fate first became known this episode), not a running cumulative total —
  -- summed across episodes the same way roster/prediction points already are.
  grand_finale_points numeric not null default 0,
  -- The only one of these four that's actually weighted (judges_score/
  -- eliminations/bonus_picks_category_weight applied in computeWeeklyScores);
  -- the others stay raw so their un-weighted values are still visible.
  total_points numeric not null default 0,
  computed_at timestamptz not null default now(),
  unique (league_id, manager_id, episode_id)
);

-- ============================================================
-- Indexes for common lookups
-- ============================================================

create index idx_league_members_user on league_members(user_id);
create index idx_roster_slots_league_manager on roster_slots(league_id, manager_id);
create index idx_roster_slots_open on roster_slots(league_id) where couple_id is null;
create index idx_dance_scores_episode_couple on dance_scores(episode_id, couple_id);
create index idx_predictions_league_episode on predictions(league_id, episode_id);
create index idx_weekly_scores_league_episode on weekly_manager_scores(league_id, episode_id);

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

  -- Grand Finale needs a deadline the moment it's enabled — there's no
  -- honest deadline to default to before a season's Week 1 is scheduled, so
  -- the commissioner's choice is only honored once a premiere date exists.
  select airs_at into v_premiere_airs_at
  from public.episodes
  where season_id = public.active_season_id() and week_number = 1;
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
    bonus_picks_deadline,
    scoring_configured
  )
  values (
    v_league.id,
    p_dance_card_enabled,
    p_curtain_call_enabled,
    v_grand_finale_enabled,
    case when v_grand_finale_enabled then 'exact_position' end,
    case when v_grand_finale_enabled then v_premiere_airs_at end,
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
create function public.leave_league(p_league_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if public.is_league_commissioner(p_league_id) then
    raise exception 'Commissioners can''t leave their own league';
  end if;

  delete from public.league_members
  where league_id = p_league_id and user_id = auth.uid();

  if not found then
    raise exception 'You are not a member of this league';
  end if;
end;
$$;

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
    where league_id = p_league_id and user_id = auth.uid()
  );
$$;

revoke execute on function public.is_league_member(uuid) from public;
grant execute on function public.is_league_member(uuid) to authenticated;

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
    where league_id = p_league_id and user_id = auth.uid() and role = 'commissioner'
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
    where lm1.user_id = auth.uid() and lm2.user_id = profiles.id
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
  p_bonus_picks_deadline timestamptz,
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
  p_bonus_picks_points_per_correct numeric
)
returns public.scoring_settings
language plpgsql
security definer set search_path = ''
as $$
declare
  v_settings public.scoring_settings;
  v_hard_deadline_airs_at timestamptz;
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Only the commissioner can update scoring categories';
  end if;

  if p_bonus_picks_deadline is not null then
    select airs_at into v_hard_deadline_airs_at
    from public.episodes
    where season_id = public.active_season_id()
      and week_number = public.effective_hard_deadline_week(p_league_id);

    if v_hard_deadline_airs_at is not null and p_bonus_picks_deadline > v_hard_deadline_airs_at then
      raise exception 'Grand Finale deadline must be before the Hard Deadline';
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
    bonus_picks_deadline = p_bonus_picks_deadline,
    bonus_picks_scoring_method = p_bonus_picks_scoring_method,
    bonus_picks_distance_penalty = p_bonus_picks_distance_penalty,
    bonus_picks_tier_size = p_bonus_picks_tier_size,
    judges_score_multiplier = p_judges_score_multiplier,
    survival_points = p_survival_points,
    first_place_points = p_first_place_points,
    second_place_points = p_second_place_points,
    third_place_points = p_third_place_points,
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
revoke execute on function public.update_scoring_categories(uuid, boolean, boolean, boolean, numeric, numeric, numeric, int, timestamptz, text, numeric, int, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) from public;
grant execute on function public.update_league_settings(uuid, text, text, int, numeric) to authenticated;
grant execute on function public.update_scoring_categories(uuid, boolean, boolean, boolean, numeric, numeric, numeric, int, timestamptz, text, numeric, int, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) to authenticated;

-- ============================================================
-- Draft: couples are global read-only reference data; starting the draft and
-- making picks are SECURITY DEFINER functions so turn order, one-couple-per-
-- league uniqueness, and completion/roster-seeding are enforced server-side —
-- a client can't skip its turn or claim an already-picked couple by racing
-- the UI, since the server recomputes whose turn it is from the pick count
-- every call (under a row lock on the league, to close the race between two
-- simultaneous picks).
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

create function public.start_draft(p_league_id uuid)
returns public.leagues
language plpgsql
security definer set search_path = ''
as $$
declare
  v_league public.leagues;
  v_member_count int;
  v_couple_count int;
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

  select count(*) into v_couple_count
  from public.couples
  where season_id = public.active_season_id();
  if v_member_count > v_couple_count then
    raise exception 'Not enough couples for every member to get at least one';
  end if;

  -- roster_size is the even split (integer division), computed here rather
  -- than commissioner-set. Any remainder couples are left undrafted for the
  -- season rather than handed out unevenly.
  update public.leagues
  set draft_status = 'in_progress', roster_size = v_couple_count / v_member_count
  where id = p_league_id
  returning * into v_league;

  return v_league;
end;
$$;

revoke execute on function public.set_draft_order(uuid, uuid[]) from public;
grant execute on function public.set_draft_order(uuid, uuid[]) to authenticated;

create function public.make_draft_pick(p_league_id uuid, p_couple_id uuid)
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
  select * into v_league from public.leagues where id = p_league_id for update;

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

  -- Snake order: odd rounds go 1..N, even rounds go N..1. Linear repeats
  -- 1..N every round.
  if v_league.draft_type = 'linear' or v_round % 2 = 1 then
    v_draft_position_needed := v_position_in_round;
  else
    v_draft_position_needed := v_member_count - v_position_in_round + 1;
  end if;

  select user_id into v_expected_manager
  from public.league_members
  where league_id = p_league_id and draft_position = v_draft_position_needed;

  if v_expected_manager is null or v_expected_manager <> auth.uid() then
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

  insert into public.draft_picks (league_id, couple_id, manager_id, round, pick_number)
  values (p_league_id, p_couple_id, auth.uid(), v_round, v_next_pick)
  returning * into v_pick;

  if v_next_pick = v_total_slots then
    update public.leagues set draft_status = 'completed' where id = p_league_id;

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
        (select min(week_number) from public.episodes
         where season_id = public.active_season_id() and airs_at > now()),
        judges_score_starts_week
      )
    )
    where league_id = p_league_id;
  end if;

  return v_pick;
end;
$$;

revoke execute on function public.start_draft(uuid) from public;
revoke execute on function public.make_draft_pick(uuid, uuid) from public;
grant execute on function public.start_draft(uuid) to authenticated;
grant execute on function public.make_draft_pick(uuid, uuid) to authenticated;

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
  was_team_dance boolean not null default false,
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

grant select on public.episode_participants to authenticated;
create policy "episode participants are viewable by all authenticated users"
on public.episode_participants for select
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

-- Each league locks relative to the same real airs_at, just with its own
-- configurable lead time (leagues.prediction_lock_hours_before_air) — so the
-- lock moment isn't a single column anywhere, it's computed. Shared by the
-- RLS policy below and submit_prediction so the two can't drift apart.
create function public.prediction_lock_at(p_league_id uuid, p_episode_id uuid)
returns timestamptz
language sql
security definer
set search_path = ''
stable
as $$
  select e.airs_at - (l.prediction_lock_hours_before_air * interval '1 hour')
  from public.episodes e, public.leagues l
  where e.id = p_episode_id and l.id = p_league_id;
$$;

revoke execute on function public.prediction_lock_at(uuid, uuid) from public;
grant execute on function public.prediction_lock_at(uuid, uuid) to authenticated;

-- A single per-league "Hard Deadline," pinned to a real episode via
-- judges_score_starts_week (no new column) — it governs where the Grand
-- Finale deadline must fall before, and where Judges' Score starts
-- counting from. The draft is expected to finish by it but isn't hard-
-- blocked: if the draft is still open when that episode airs, the
-- *effective* deadline auto-advances to the next not-yet-aired episode
-- (this function), and make_draft_pick freezes that advanced value into
-- judges_score_starts_week once the draft actually completes.
create function public.effective_hard_deadline_week(p_league_id uuid)
returns int
language sql
security definer
set search_path = ''
stable
as $$
  select case
    when l.draft_status = 'completed' then ss.judges_score_starts_week
    else greatest(
      ss.judges_score_starts_week,
      coalesce(
        (select min(e.week_number) from public.episodes e
         where e.season_id = public.active_season_id() and e.airs_at > now()),
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

create policy "predictions visible to owner pre-lock, league post-lock"
on public.predictions for select
using (
  public.is_league_member(league_id)
  and (
    auth.uid() = manager_id
    or now() >= public.prediction_lock_at(league_id, episode_id)
  )
);

create function public.submit_prediction(
  p_league_id uuid,
  p_episode_id uuid,
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
begin
  if not public.is_league_member(p_league_id) then
    raise exception 'You are not a member of this league';
  end if;

  if not exists (
    select 1 from public.scoring_settings
    where league_id = p_league_id and eliminations_category_enabled
  ) then
    raise exception 'Curtain Call is not enabled for this league';
  end if;

  select is_double_elimination_week into v_is_double_elim
  from public.episodes where id = p_episode_id;

  if v_is_double_elim is null then
    raise exception 'Episode not found';
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
    raise exception 'This episode is not a double elimination week';
  end if;

  v_lock_at := public.prediction_lock_at(p_league_id, p_episode_id);

  if now() >= v_lock_at then
    raise exception 'Predictions are locked for this episode';
  end if;

  insert into public.predictions (
    league_id, manager_id, episode_id,
    predicted_eliminated_couple_id, predicted_eliminated_couple_id_2,
    predicted_top_scorer_couple_id
  )
  values (
    p_league_id, auth.uid(), p_episode_id,
    p_predicted_eliminated_couple_id, p_predicted_eliminated_couple_id_2,
    p_predicted_top_scorer_couple_id
  )
  on conflict (league_id, manager_id, episode_id) do update set
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
-- visibility as weekly predictions, but the lock moment is a single
-- commissioner-set deadline (scoring_settings.bonus_picks_deadline) rather
-- than one computed per episode, so no separate lock_at function is needed.
-- ============================================================

grant select on public.grand_finale_predictions to authenticated;

create policy "grand finale predictions visible to owner pre-deadline, league post-deadline"
on public.grand_finale_predictions for select
using (
  public.is_league_member(league_id)
  and (
    auth.uid() = manager_id
    or now() >= (
      select bonus_picks_deadline from public.scoring_settings
      where league_id = grand_finale_predictions.league_id
    )
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
begin
  if not public.is_league_member(p_league_id) then
    raise exception 'You are not a member of this league';
  end if;

  select bonus_picks_deadline into v_deadline
  from public.scoring_settings
  where league_id = p_league_id and bonus_picks_category_enabled;

  if v_deadline is null then
    raise exception 'Grand Finale is not enabled for this league';
  end if;

  if now() >= v_deadline then
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
  where league_id = p_league_id and manager_id = auth.uid();

  return query
  insert into public.grand_finale_predictions (league_id, manager_id, couple_id, predicted_position)
  select p_league_id, auth.uid(), c, ordinality
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
begin
  if not public.is_league_member(p_league_id) then
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
      and rs.manager_id = auth.uid()
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

  v_current_week := coalesce((select max(week_number) from public.episodes where status = 'completed'), 0);

  insert into public.waiver_claims (league_id, couple_id, manager_id, slot_number, week_number, status)
  values (p_league_id, p_couple_id, auth.uid(), p_slot_number, v_current_week, 'pending')
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
