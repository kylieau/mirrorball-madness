-- Option B: competition weeks that can group multiple TV episodes.
-- Run in the Supabase Dashboard SQL Editor against the live project.
-- schema.sql remains the greenfield source of truth.
--
-- Product:
--   Episode = one TV airing (schedule row, that night's cast, dances).
--   Week = fantasy round (Results/Picks carousel, elim outcome, spoiler mark).
--   Do NOT fold premiere nights into one episode row (that was PR #28 Option A).
--   Do NOT reintroduce week_part.
--   Exhibition / interview = episode with week_id null (omitted from Results/Picks).
--
-- This script is written for the live project after apply-s35-premiere-fold.sql
-- (is_scoring column + folded Week 1). It also handles an unfolder 1:1 season
-- (Night One + Night Two still separate episode rows) by grouping them under
-- Week 1 instead of merging. Safe-ish to re-run: schema uses IF NOT EXISTS /
-- IF EXISTS; data steps skip when week_id is already populated.
--
-- Night Two restore (folded premiere): inserts an empty Night Two episode
-- under Week 1 and leaves dance_scores on Night One. Split-cast tick boxes
-- cannot be recovered (fold cleared episode_participants). Owner can re-tick
-- Night One vs Night Two in Admin → Schedule after this runs.
--
-- Apply BEFORE deploying the app code that reads competition_weeks / week_id.
--
-- Live failures already fixed in this file (re-run the whole script; prior
-- attempts rolled back):
--   23502 Night Two omitted still-NOT-NULL week_number — insert now copies
--         every live episodes column except id.
--   42P13 CREATE OR REPLACE cannot rename p_episode_id — DROP FUNCTION first.
--   2BP01 policy depends on prediction_lock_at — DROP POLICY first (one line).
--   42803 min(airs_at) minus joined lock-hours — scalar subquery, one body.

begin;

-- CREATE OR REPLACE cannot rename p_episode_id → p_week_id (42P13). The
-- predictions RLS policy depends on prediction_lock_at (2BP01), so drop
-- the policy first. Single-line so a statement splitter cannot run the
-- DROP FUNCTION while the policy still exists.
drop policy if exists "predictions visible to owner pre-lock, league post-lock" on public.predictions;
drop function if exists public.prediction_lock_at(uuid, uuid);
drop function if exists public.submit_prediction(uuid, uuid, uuid, uuid, uuid);

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------

create table if not exists public.competition_weeks (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id),
  week_number int not null check (week_number > 0),
  theme text,
  is_elimination_week boolean not null default true,
  is_finale boolean not null default false,
  is_double_elimination_week boolean not null default false,
  unique (season_id, week_number)
);

grant select on public.competition_weeks to authenticated;

drop policy if exists "competition weeks are viewable by all authenticated users"
  on public.competition_weeks;
create policy "competition weeks are viewable by all authenticated users"
on public.competition_weeks for select
using (true);

alter table public.episodes
  add column if not exists episode_number int;

alter table public.episodes
  add column if not exists week_id uuid references public.competition_weeks(id) on delete restrict;

alter table public.predictions
  add column if not exists week_id uuid references public.competition_weeks(id);

alter table public.weekly_manager_scores
  add column if not exists week_id uuid references public.competition_weeks(id);

create index if not exists idx_episodes_week on public.episodes(week_id);
create index if not exists idx_predictions_league_week on public.predictions(league_id, week_id);
create index if not exists idx_weekly_scores_league_week on public.weekly_manager_scores(league_id, week_id);

-- Night Two restore inserts a second episode with week_number = 1 (the
-- column is still NOT NULL until later). Drop the old 1:1 unique first.
alter table public.episodes
  drop constraint if exists episodes_season_id_week_number_key;

-- ---------------------------------------------------------------------------
-- 2. Data: one competition week per scoring episode, then premiere grouping
-- ---------------------------------------------------------------------------

do $$
declare
  v_season_id uuid;
  v_season_name text;
  v_has_is_scoring boolean;
  v_night1 public.episodes;
  v_night2 public.episodes;
  v_week1 public.competition_weeks;
  v_week_id uuid;
  v_week_n int;
  v_fold boolean := false;
  v_night1_participants int;
  v_night2_participants int;
  v_overlap_participants int;
  v_night1_dance_couples int;
  v_night2_dance_couples int;
  v_overlap_dance_couples int;
  v_ep record;
  v_new_id uuid;
  v_col_list text;
  v_overlay jsonb;
begin
  select id, name into v_season_id, v_season_name
  from public.seasons
  where is_active
  limit 1;

  if v_season_id is null then
    raise exception 'No active season — aborting';
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'episodes' and column_name = 'is_scoring'
  ) into v_has_is_scoring;

  raise notice '=== BEFORE (%) is_scoring_column=% ===', v_season_name, v_has_is_scoring;
  for v_ep in
    select
      e.id,
      e.episode_number,
      e.week_id,
      e.theme,
      e.status,
      e.airs_at,
      (select count(*) from public.dance_scores ds where ds.episode_id = e.id) as dances,
      (select count(*) from public.episode_results er where er.episode_id = e.id) as results,
      (select count(*) from public.episode_participants ep where ep.episode_id = e.id) as participants
    from public.episodes e
    where e.season_id = v_season_id
    order by coalesce(e.episode_number, 0), e.airs_at
  loop
    raise notice 'ep % episode_number=% week_id=% theme=% status=% dances=% results=% participants=% airs_at=%',
      v_ep.id, v_ep.episode_number, v_ep.week_id, coalesce(v_ep.theme, '∅'), v_ep.status,
      v_ep.dances, v_ep.results, v_ep.participants, v_ep.airs_at;
  end loop;

  -- TV sequence = air order (interview parked at week_number 0 still sorts by airs_at).
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'episodes' and column_name = 'week_number'
  ) then
    update public.episodes e
    set episode_number = s.n
    from (
      select id, row_number() over (order by airs_at, week_number, id)::int as n
      from public.episodes
      where season_id = v_season_id
    ) s
    where e.id = s.id
      and e.episode_number is distinct from s.n;
  elsif exists (
    select 1 from public.episodes where season_id = v_season_id and episode_number is null
  ) then
    update public.episodes e
    set episode_number = s.n
    from (
      select id, row_number() over (order by airs_at, id)::int as n
      from public.episodes
      where season_id = v_season_id
    ) s
    where e.id = s.id
      and e.episode_number is distinct from s.n;
  end if;

  -- Already migrated (every row has episode_number + scoring rows have week_id).
  if exists (
    select 1 from public.episodes
    where season_id = v_season_id and week_id is not null
  ) then
    raise notice 'week_id already populated — skipping 1:1 week create / premiere group';
  else
    -- Exhibition: is_scoring=false, week_number 0 (fold park), or interview theme.
    -- Everyone else gets a competition week, 1:1, then maybe grouped.
    create temporary table scoring_eps (
      episode_id uuid primary key,
      airs_at timestamptz not null,
      old_week int not null,
      is_elim boolean not null,
      is_finale boolean not null,
      is_double boolean not null,
      theme text,
      sort_n int not null
    ) on commit drop;

    insert into scoring_eps (episode_id, airs_at, old_week, is_elim, is_finale, is_double, theme, sort_n)
    select
      e.id,
      e.airs_at,
      e.week_number,
      e.is_elimination_week,
      e.is_finale,
      e.is_double_elimination_week,
      e.theme,
      row_number() over (order by e.airs_at, e.week_number)::int
    from public.episodes e
    where e.season_id = v_season_id
      and e.week_number <> 0
      and (
        not v_has_is_scoring
        or coalesce((to_jsonb(e)->>'is_scoring')::boolean, true)
      )
      and coalesce(e.theme, '') !~* 'interview';

    -- Split premiere still stored as two episode rows (fold never ran, or was undone).
    select e.* into v_night1
    from public.episodes e
    join scoring_eps s on s.episode_id = e.id
    where s.sort_n = 1;
    select e.* into v_night2
    from public.episodes e
    join scoring_eps s on s.episode_id = e.id
    where s.sort_n = 2;

    if v_night1.id is not null and v_night2.id is not null then
      select count(*) into v_night1_participants
      from public.episode_participants where episode_id = v_night1.id;
      select count(*) into v_night2_participants
      from public.episode_participants where episode_id = v_night2.id;
      select count(*) into v_overlap_participants
      from public.episode_participants a
      join public.episode_participants b on a.couple_id = b.couple_id
      where a.episode_id = v_night1.id and b.episode_id = v_night2.id;

      select count(distinct couple_id) into v_night1_dance_couples
      from public.dance_scores where episode_id = v_night1.id;
      select count(distinct couple_id) into v_night2_dance_couples
      from public.dance_scores where episode_id = v_night2.id;
      select count(*) into v_overlap_dance_couples
      from (
        select distinct couple_id from public.dance_scores where episode_id = v_night1.id
        intersect
        select distinct couple_id from public.dance_scores where episode_id = v_night2.id
      ) overlap;

      v_fold :=
        (v_night1_participants > 0 and v_night2_participants > 0 and v_overlap_participants = 0)
        or (v_night1_dance_couples > 0 and v_night2_dance_couples > 0 and v_overlap_dance_couples = 0)
        or (
          coalesce(v_night1.theme, '') ~* '(premiere|night\s*1|part\s*1)'
          and coalesce(v_night2.theme, '') ~* '(premiere|night\s*2|part\s*2)'
        );

      if v_fold then
        raise notice 'Grouping split premiere episodes % + % under Week 1 (not merging rows)',
          v_night1.id, v_night2.id;
      end if;
    end if;

    v_week_n := 0;
    for v_ep in
      select * from scoring_eps order by sort_n
    loop
      if v_fold and v_ep.sort_n = 2 then
        -- Second premiere night shares Week 1.
        update public.episodes set week_id = v_week_id where id = v_ep.episode_id;
        update public.competition_weeks
        set
          is_elimination_week = is_elimination_week or v_ep.is_elim,
          is_double_elimination_week = is_double_elimination_week or v_ep.is_double,
          is_finale = false
        where id = v_week_id;
        continue;
      end if;

      v_week_n := v_week_n + 1;
      insert into public.competition_weeks (
        season_id, week_number, theme,
        is_elimination_week, is_finale, is_double_elimination_week
      )
      values (
        v_season_id,
        v_week_n,
        case when v_fold and v_ep.sort_n = 1 then coalesce(nullif(trim(v_ep.theme), ''), 'Premiere') else v_ep.theme end,
        v_ep.is_elim,
        v_ep.is_finale,
        v_ep.is_double
      )
      returning id into v_week_id;

      update public.episodes set week_id = v_week_id where id = v_ep.episode_id;
    end loop;

    raise notice 'Created % competition weeks (1:1 or grouped premiere)', v_week_n;
  end if;

  -- Folded premiere restore: Option A merged Night Two into Week 1's single
  -- episode. Recreate Night Two as its own row under the same week.
  select * into v_week1
  from public.competition_weeks
  where season_id = v_season_id and week_number = 1;

  if v_week1.id is not null
     and v_has_is_scoring
     and (select count(*) from public.episodes where week_id = v_week1.id) = 1 then
    select * into v_night1 from public.episodes where week_id = v_week1.id;

    raise notice 'Restoring Night Two under Week 1 (folded premiere undo). Night One stays %; dances stay on Night One.',
      v_night1.id;

    -- Make room at episode_number = 2.
    update public.episodes
    set episode_number = episode_number + 1000
    where season_id = v_season_id and episode_number >= 2;

    update public.episodes
    set episode_number = episode_number - 1000 + 1
    where season_id = v_season_id and episode_number >= 1002;

    if coalesce(v_night1.theme, '') ~* '(premiere|night\s*1|part\s*1)'
       or coalesce(v_week1.theme, '') ~* 'premiere' then
      update public.episodes set theme = 'Night One' where id = v_night1.id;
      update public.competition_weeks
      set theme = coalesce(nullif(trim(theme), ''), 'Premiere')
      where id = v_week1.id;
    end if;

    -- Copy every live episodes column except id (23502 if a still-NOT-NULL
    -- column is omitted — week_number was the first). Extra jsonb keys are
    -- ignored after those columns drop, so a re-run still parses.
    v_overlay := to_jsonb(v_night1) - 'id' || jsonb_build_object(
      'episode_number', 2,
      'week_id', v_week1.id,
      'week_number', 1,
      'airs_at', v_night1.airs_at + interval '1 day',
      'theme', 'Night Two',
      'is_elimination_week', coalesce(
        (to_jsonb(v_night1)->>'is_elimination_week')::boolean,
        v_week1.is_elimination_week
      ),
      'is_finale', coalesce((to_jsonb(v_night1)->>'is_finale')::boolean, v_week1.is_finale),
      'is_double_elimination_week', coalesce(
        (to_jsonb(v_night1)->>'is_double_elimination_week')::boolean,
        v_week1.is_double_elimination_week
      ),
      'is_scoring', coalesce((to_jsonb(v_night1)->>'is_scoring')::boolean, true)
    );

    select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position)
    into v_col_list
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'episodes'
      and c.column_name <> 'id'
      and coalesce(c.is_generated, 'NEVER') <> 'ALWAYS';

    execute format(
      'insert into public.episodes (%s)
       select %s
       from jsonb_populate_record(null::public.episodes, $1)
       returning id',
      v_col_list,
      v_col_list
    ) using v_overlay into v_new_id;

    raise notice 'Inserted Night Two episode % (empty dances/participants — re-tick cast in Admin → Schedule)',
      v_new_id;
  else
    raise notice 'Skipping Night Two restore (week 1 already has % episode(s), or is_scoring was never added)',
      coalesce((select count(*) from public.episodes where week_id = v_week1.id), 0);
  end if;

  -- Backfill predictions / weekly_manager_scores onto week_id.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'predictions' and column_name = 'episode_id'
  ) then
    update public.predictions p
    set week_id = e.week_id
    from public.episodes e
    where p.episode_id = e.id
      and p.week_id is null
      and e.week_id is not null;

    delete from public.predictions a
    using public.predictions b
    where a.week_id is not null
      and a.week_id = b.week_id
      and a.league_id = b.league_id
      and a.manager_id = b.manager_id
      and a.id <> b.id
      and a.submitted_at <= b.submitted_at
      and (a.submitted_at < b.submitted_at or a.id > b.id);

    delete from public.predictions where week_id is null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'weekly_manager_scores' and column_name = 'episode_id'
  ) then
    update public.weekly_manager_scores s
    set week_id = e.week_id
    from public.episodes e
    where s.episode_id = e.id
      and s.week_id is null
      and e.week_id is not null;

    -- Two episode rows in one week can produce two score rows per manager;
    -- keep the one with more total_points (folded data should already be 1:1).
    delete from public.weekly_manager_scores a
    using public.weekly_manager_scores b
    where a.week_id = b.week_id
      and a.league_id = b.league_id
      and a.manager_id = b.manager_id
      and a.id <> b.id
      and (
        a.total_points < b.total_points
        or (a.total_points = b.total_points and a.id > b.id)
      );

    delete from public.weekly_manager_scores where week_id is null;
  end if;

  raise notice '=== AFTER (%) ===', v_season_name;
  for v_ep in
    select
      e.episode_number,
      e.id as episode_id,
      w.week_number,
      e.week_id,
      e.theme as episode_theme,
      w.theme as week_theme,
      e.status,
      e.airs_at
    from public.episodes e
    left join public.competition_weeks w on w.id = e.week_id
    where e.season_id = v_season_id
    order by e.episode_number
  loop
    raise notice 'E% episode=% week=% week_id=% ep_theme=% week_theme=% status=% airs_at=%',
      v_ep.episode_number, v_ep.episode_id, coalesce(v_ep.week_number::text, 'exhibition'),
      v_ep.week_id, coalesce(v_ep.episode_theme, '∅'), coalesce(v_ep.week_theme, '∅'),
      v_ep.status, v_ep.airs_at;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Constraints after backfill
-- ---------------------------------------------------------------------------

-- SET NOT NULL is table-wide; backfill above is active-season first.
-- Any leftover null (other seasons, or a row the 1:1 loop skipped) gets
-- a number after that season's current max so we cannot collide.
update public.episodes e
set episode_number = s.assigned
from (
  select
    e2.id,
    coalesce(m.max_n, 0)
      + row_number() over (partition by e2.season_id order by e2.airs_at, e2.id) as assigned
  from public.episodes e2
  left join (
    select season_id, max(episode_number) as max_n
    from public.episodes
    group by season_id
  ) m on m.season_id = e2.season_id
  where e2.episode_number is null
) s
where e.id = s.id;

alter table public.episodes
  alter column episode_number set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'episodes_season_id_episode_number_key'
  ) then
    alter table public.episodes
      add constraint episodes_season_id_episode_number_key unique (season_id, episode_number);
  end if;
end $$;

alter table public.episodes
  drop constraint if exists episodes_season_id_week_number_key;

-- Predictions: swap unique key to week_id, drop episode_id.
alter table public.predictions
  drop constraint if exists predictions_league_id_manager_id_episode_id_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'predictions_league_id_manager_id_week_id_key'
  ) then
    alter table public.predictions
      add constraint predictions_league_id_manager_id_week_id_key unique (league_id, manager_id, week_id);
  end if;
end $$;

-- Same trio as after BEGIN (IF EXISTS). Policy drop stays on one line.
-- CREATE OR REPLACE cannot rename p_episode_id (42P13); the policy
-- depends on prediction_lock_at (2BP01). There is exactly one
-- prediction_lock_at body in this file (a second copy used to drift).
drop policy if exists "predictions visible to owner pre-lock, league post-lock" on public.predictions;
drop function if exists public.prediction_lock_at(uuid, uuid);
drop function if exists public.submit_prediction(uuid, uuid, uuid, uuid, uuid);

create or replace function public.prediction_lock_at(p_league_id uuid, p_week_id uuid)
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

delete from public.predictions where week_id is null;

alter table public.predictions
  alter column week_id set not null;

alter table public.predictions
  drop constraint if exists predictions_episode_id_fkey;

alter table public.predictions
  drop column if exists episode_id;

create policy "predictions visible to owner pre-lock, league post-lock"
on public.predictions for select
using (
  public.is_league_member(league_id)
  and (
    auth.uid() = manager_id
    or now() >= public.prediction_lock_at(league_id, week_id)
  )
);

alter table public.weekly_manager_scores
  drop constraint if exists weekly_manager_scores_league_id_manager_id_episode_id_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'weekly_manager_scores_league_id_manager_id_week_id_key'
  ) then
    alter table public.weekly_manager_scores
      add constraint weekly_manager_scores_league_id_manager_id_week_id_key
      unique (league_id, manager_id, week_id);
  end if;
end $$;

delete from public.weekly_manager_scores where week_id is null;

alter table public.weekly_manager_scores
  alter column week_id set not null;

alter table public.weekly_manager_scores
  drop constraint if exists weekly_manager_scores_episode_id_fkey;

alter table public.weekly_manager_scores
  drop column if exists episode_id;

drop index if exists idx_predictions_league_episode;
drop index if exists idx_weekly_scores_league_episode;

-- ---------------------------------------------------------------------------
-- 4. RPCs now keyed off competition weeks
-- Recreate these BEFORE dropping episodes.week_number — live SQL functions
-- (especially effective_hard_deadline_week) still depend on that column.
-- ---------------------------------------------------------------------------

create or replace function public.create_league(
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
  v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_i int;
  v_premiere_airs_at timestamptz;
  v_grand_finale_enabled boolean;
begin
  if trim(p_name) = '' then
    raise exception 'League name is required';
  end if;

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

  insert into public.scoring_settings (
    league_id,
    judges_score_category_enabled,
    eliminations_category_enabled,
    bonus_picks_category_enabled,
    bonus_picks_scoring_method,
    scoring_configured
  )
  values (
    v_league.id,
    p_dance_card_enabled,
    p_curtain_call_enabled,
    v_grand_finale_enabled,
    case when v_grand_finale_enabled then 'exact_position' end,
    true
  );

  return v_league;
end;
$$;

-- record_draft_pick is large; only the freeze lookup changes. Recreate from schema.
create or replace function public.record_draft_pick(
  p_league_id uuid,
  p_couple_id uuid,
  p_manager_id uuid,
  p_is_auto boolean
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

  if v_league.draft_type = 'linear' or v_round % 2 = 1 then
    v_draft_position_needed := v_position_in_round;
  else
    v_draft_position_needed := v_member_count - v_position_in_round + 1;
  end if;

  select user_id into v_expected_manager
  from public.league_members
  where league_id = p_league_id and draft_position = v_draft_position_needed;

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

  insert into public.draft_picks (league_id, couple_id, manager_id, round, pick_number, is_auto)
  values (p_league_id, p_couple_id, p_manager_id, v_round, v_next_pick, p_is_auto)
  returning * into v_pick;

  if v_next_pick = v_total_slots then
    update public.leagues
    set draft_status = 'completed', current_turn_started_at = now()
    where id = p_league_id;

    insert into public.roster_slots (league_id, manager_id, slot_number, couple_id, source, start_week)
    select league_id, manager_id, row_number() over (partition by manager_id order by pick_number), couple_id, 'draft', 1
    from public.draft_picks
    where league_id = p_league_id;

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
    update public.leagues
    set current_turn_started_at = now()
    where id = p_league_id;
  end if;

  return v_pick;
end;
$$;

revoke execute on function public.record_draft_pick(uuid, uuid, uuid, boolean) from public, authenticated;

create or replace function public.effective_hard_deadline_week(p_league_id uuid)
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

create or replace function public.effective_grand_finale_deadline(p_league_id uuid)
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

create or replace function public.submit_prediction(
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
    p_league_id, auth.uid(), p_week_id,
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

create or replace function public.submit_waiver_claim(
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
  values (p_league_id, p_couple_id, auth.uid(), p_slot_number, v_current_week, 'pending')
  returning * into v_claim;

  if v_league.waiver_claim_method = 'fcfs' then
    return public.finalize_waiver_claim(v_claim.id);
  end if;

  return v_claim;
end;
$$;

revoke execute on function public.prediction_lock_at(uuid, uuid) from public;
grant execute on function public.prediction_lock_at(uuid, uuid) to authenticated;
revoke execute on function public.effective_hard_deadline_week(uuid) from public;
grant execute on function public.effective_hard_deadline_week(uuid) to authenticated;
revoke execute on function public.effective_grand_finale_deadline(uuid) from public;
grant execute on function public.effective_grand_finale_deadline(uuid) to authenticated;
revoke execute on function public.submit_prediction(uuid, uuid, uuid, uuid, uuid) from public;
grant execute on function public.submit_prediction(uuid, uuid, uuid, uuid, uuid) to authenticated;
revoke execute on function public.submit_waiver_claim(uuid, int, uuid) from public;
grant execute on function public.submit_waiver_claim(uuid, int, uuid) to authenticated;

-- Episode-level competition flags moved onto competition_weeks. After the
-- RPCs above so Postgres is not still tracking week_number on the old
-- effective_hard_deadline_week SQL body.
alter table public.episodes drop column if exists week_number;
alter table public.episodes drop column if exists is_elimination_week;
alter table public.episodes drop column if exists is_finale;
alter table public.episodes drop column if exists is_double_elimination_week;
alter table public.episodes drop column if exists is_scoring;

commit;
