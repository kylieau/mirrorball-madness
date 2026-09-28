-- Strong-play ceiling recalibration.
--
-- Module weights are shares of a strong-play season ceiling, not Monte Carlo
-- standings spread. One weight of 1 is 100 season points (POINT_SCALE 0.1
-- on a 1000-point unscaled share). Grand Finale is not capped at 3/5.
-- Solver: src/lib/strong-play-ceilings.ts.
--
-- What this changes
--   * Column defaults on scoring_settings (new leagues).
--   * dance_card_calibration (every future start_draft).
--   * create_league, so enabling Grand Finale seeds weight 1 and the new
--     distance penalty / points-per-correct.
--   * Point-budget columns on exactly these four leagues. Module on/off and
--     category weights are not touched. judges_score_multiplier is written
--     from dance_card_calibration by roster size; the script refuses to run
--     if any of the four has judges_score_multiplier_customized.
--   * weekly_manager_scores for those four leagues, recomputed from dances,
--     outcomes, picks, and brackets with the same rules as
--     recomputeWeekScores in src/lib/results.ts.
--
-- Leagues (Still Shot and Test League Explore are already gone; do not add
-- anyone else):
--   f38df148-85b2-4f06-89ae-6ef72b8fea2e  #supportSWEKylie
--   3e0e38cd-823a-41af-a411-0ecf1fc88226  Carrie Ann's Biggest Fans
--   8afa3b4f-a4d6-4e2d-902f-19716c41f7c4  matt with the stars
--   d18784af-378c-4d63-8000-d5928265aab1  Pen & Paso
--
-- Safe to re-run: point values are set to the calibrated numbers, not
-- multiplied, and scores are deleted and rebuilt. A re-run overwrites any
-- commissioner edit to those point-budget columns made after this script.
--
-- Run in the Supabase Dashboard SQL Editor. Do not run it twice in two
-- tabs at once.

begin;

do $$
declare
  v_found int;
begin
  select count(*) into v_found
  from public.leagues
  where id in (
    'f38df148-85b2-4f06-89ae-6ef72b8fea2e',
    '3e0e38cd-823a-41af-a411-0ecf1fc88226',
    '8afa3b4f-a4d6-4e2d-902f-19716c41f7c4',
    'd18784af-378c-4d63-8000-d5928265aab1'
  );
  if v_found <> 4 then
    raise exception 'Expected the 4 live leagues, found %', v_found;
  end if;

  if exists (
    select 1
    from public.scoring_settings
    where league_id in (
      'f38df148-85b2-4f06-89ae-6ef72b8fea2e',
      '3e0e38cd-823a-41af-a411-0ecf1fc88226',
      '8afa3b4f-a4d6-4e2d-902f-19716c41f7c4',
      'd18784af-378c-4d63-8000-d5928265aab1'
    )
      and judges_score_multiplier_customized
  ) then
    raise exception 'A target league has judges_score_multiplier_customized; refusing to overwrite it';
  end if;
end $$;

alter table public.scoring_settings
  alter column judges_score_multiplier set default 0.1421,
  alter column survival_points set default 1.56,
  alter column elimination_prediction_points set default 10.35,
  alter column top_scorer_prediction_points set default 6.9,
  alter column first_place_points set default 26.09,
  alter column second_place_points set default 13.04,
  alter column third_place_points set default 6.96,
  alter column fourth_place_points set default 3.48,
  alter column fifth_place_points set default 1.74,
  alter column bonus_picks_points_per_correct set default 8.33;

insert into public.dance_card_calibration (roster_size, judges_score_multiplier_default) values
  (1, 0.5735),
  (2, 0.2449),
  (3, 0.1421),
  (4, 0.0859),
  (5, 0.0293),
  (6, 0.0274)
on conflict (roster_size) do update
set judges_score_multiplier_default = excluded.judges_score_multiplier_default;

-- Point budgets only. Enabled flags and category weights stay as they are.
update public.scoring_settings ss
set
  survival_points = 1.56,
  elimination_prediction_points = 10.35,
  top_scorer_prediction_points = 6.9,
  first_place_points = 26.09,
  second_place_points = 13.04,
  third_place_points = 6.96,
  fourth_place_points = 3.48,
  fifth_place_points = 1.74,
  judges_score_multiplier = cal.judges_score_multiplier_default,
  bonus_picks_points_per_correct = case
    when ss.bonus_picks_scoring_method = 'exact_position' then 8.33
    when ss.bonus_picks_scoring_method = 'band_tier' and ss.bonus_picks_tier_pay_style = 'graded' then 13.33
    else 8.33
  end,
  bonus_picks_distance_penalty = case
    when ss.bonus_picks_scoring_method = 'distance_based' then 2.08
    else ss.bonus_picks_distance_penalty
  end
from public.leagues l
join lateral (
  select judges_score_multiplier_default
  from public.dance_card_calibration
  order by abs(roster_size - l.roster_size), roster_size
  limit 1
) cal on true
where ss.league_id = l.id
  and l.id in (
    'f38df148-85b2-4f06-89ae-6ef72b8fea2e',
    '3e0e38cd-823a-41af-a411-0ecf1fc88226',
    '8afa3b4f-a4d6-4e2d-902f-19716c41f7c4',
    'd18784af-378c-4d63-8000-d5928265aab1'
  )
  and not ss.judges_score_multiplier_customized;

-- Mirrors bandPayoutFraction / grandFinalePointsAt in src/lib/scoring.ts.
create or replace function public._sp_band_fraction(p_band int)
returns numeric
language sql
immutable
as $$
  select greatest(0.25::numeric, 1 - 0.25 * p_band);
$$;

create or replace function public._sp_gf_at(
  p_predicted int,
  p_actual int,
  p_total int,
  p_method text,
  p_penalty numeric,
  p_tier int,
  p_style text,
  p_ppc numeric
) returns numeric
language plpgsql
immutable
as $$
declare
  v_width int;
  v_predicted_band int;
  v_actual_band int;
begin
  if p_method = 'distance_based' then
    return greatest(0, p_ppc - abs(p_predicted - p_actual) * coalesce(p_penalty, 0));
  end if;

  if p_method = 'band_tier' then
    v_width := greatest(1, coalesce(p_tier, 1));
    v_predicted_band := floor((p_total - p_predicted)::numeric / v_width)::int;
    v_actual_band := floor((p_total - p_actual)::numeric / v_width)::int;
    if v_predicted_band <> v_actual_band then
      return 0;
    end if;
    if p_style = 'graded' then
      return p_ppc * public._sp_band_fraction(v_actual_band);
    end if;
    return p_ppc;
  end if;

  -- exact_position, and the engine's fallback when method is null.
  if p_predicted = p_actual then
    return p_ppc;
  end if;
  return 0;
end;
$$;

create or replace function public._sp_guess_points(p_verdict text, p_exact numeric, p_near boolean)
returns numeric
language sql
immutable
as $$
  select case
    when p_verdict = 'exact' then round(p_exact, 2)
    when p_verdict = 'near_miss' and p_near then round(p_exact * 0.25, 2)
    else 0::numeric
  end;
$$;

-- One league-week. Same inputs as recomputeWeekScores: dances and outcomes
-- already stored, roster timeline, picks, late-entry factor. A week that is
-- only revealing (dances posted, no published results) scores judges points
-- only. Weeks before the league's Anchor Week pay nothing.
create or replace function public._sp_recompute_league_week(p_league_id uuid, p_week_id uuid)
returns void
language plpgsql
as $$
declare
  v_week_number int;
  v_double boolean;
  v_season uuid;
  v_starts int;
  v_mult numeric;
  v_survival numeric;
  v_elim_base numeric;
  v_top_base numeric;
  v_first numeric;
  v_second numeric;
  v_third numeric;
  v_fourth numeric;
  v_fifth numeric;
  v_near boolean;
  v_w_judges numeric;
  v_w_elim numeric;
  v_w_bonus numeric;
  v_method text;
  v_penalty numeric;
  v_tier int;
  v_style text;
  v_ppc numeric;
  v_total int;
  v_remaining int;
  v_full boolean;
  v_elim_exact numeric;
  v_top_exact numeric;
  v_high numeric;
begin
  select w.week_number, w.is_double_elimination_week, w.season_id
  into v_week_number, v_double, v_season
  from public.competition_weeks w
  where w.id = p_week_id;

  select
    ss.judges_score_starts_week,
    ss.judges_score_multiplier,
    ss.survival_points,
    ss.elimination_prediction_points,
    ss.top_scorer_prediction_points,
    ss.first_place_points,
    ss.second_place_points,
    ss.third_place_points,
    ss.fourth_place_points,
    ss.fifth_place_points,
    ss.curtain_call_near_miss_enabled,
    ss.judges_score_category_weight,
    ss.eliminations_category_weight,
    ss.bonus_picks_category_weight,
    coalesce(ss.bonus_picks_scoring_method, 'exact_position'),
    ss.bonus_picks_distance_penalty,
    ss.bonus_picks_tier_size,
    ss.bonus_picks_tier_pay_style,
    ss.bonus_picks_points_per_correct
  into
    v_starts, v_mult, v_survival, v_elim_base, v_top_base,
    v_first, v_second, v_third, v_fourth, v_fifth,
    v_near, v_w_judges, v_w_elim, v_w_bonus,
    v_method, v_penalty, v_tier, v_style, v_ppc
  from public.scoring_settings ss
  where ss.league_id = p_league_id;

  if v_starts is null then
    return;
  end if;

  delete from public.weekly_manager_scores
  where league_id = p_league_id and week_id = p_week_id;

  if v_week_number < v_starts then
    return;
  end if;

  v_full := exists (
    select 1
    from public.episodes e
    where e.week_id = p_week_id
      and (
        e.results_published_at is not null
        or exists (select 1 from public.episode_results er where er.episode_id = e.id)
      )
  );

  if not v_full and not exists (
    select 1
    from public.dance_scores d
    join public.episodes e on e.id = d.episode_id
    where e.week_id = p_week_id
  ) then
    return;
  end if;

  select count(*) into v_total from public.couples where season_id = v_season;
  select count(*) into v_remaining
  from public.couples
  where season_id = v_season
    and (elimination_week is null or elimination_week >= v_week_number);

  if v_total > 0 then
    v_elim_exact := v_elim_base * v_remaining::numeric / v_total;
    v_top_exact := v_top_base * v_remaining::numeric / v_total;
  else
    v_elim_exact := v_elim_base;
    v_top_exact := v_top_base;
  end if;

  -- Scratch tables are created by the caller before the first call so this
  -- body can be planned against relations that already exist.
  truncate _sp_ranges, _sp_outcomes, _sp_dances, _sp_elim, _sp_jeopardy, _sp_roster, _sp_pred, _sp_gf;

  insert into _sp_dances (couple_id, total)
  select d.couple_id, sum(d.total_score)
  from public.dance_scores d
  join public.episodes e on e.id = d.episode_id
  where e.week_id = p_week_id
  group by d.couple_id;

  select coalesce(max(total), 0) into v_high from _sp_dances;

  if v_full then
    insert into _sp_outcomes (couple_id, outcome, bonus_points)
    select distinct on (er.couple_id) er.couple_id, er.outcome, er.bonus_points
    from public.episode_results er
    join public.episodes e on e.id = er.episode_id
    where e.week_id = p_week_id
    order by er.couple_id, e.episode_number desc;

    insert into _sp_elim (couple_id)
    select couple_id from _sp_outcomes where outcome = 'eliminated';

    insert into _sp_jeopardy (couple_id)
    select distinct j.couple_id
    from public.episode_in_jeopardy_couples j
    join public.episodes e on e.id = j.episode_id
    where e.week_id = p_week_id
    on conflict do nothing;

    insert into _sp_ranges (couple_id, start_pos, end_pos)
    select c.id, v_total, v_total
    from public.couples c
    where c.season_id = v_season and c.status = 'winner'
    union all
    select c.id, v_total - 1, v_total - 1
    from public.couples c
    where c.season_id = v_season and c.status = 'runner_up'
    union all
    select c.id, v_total - 2, v_total - 2
    from public.couples c
    where c.season_id = v_season and c.status = 'third_place'
    union all
    select m.id, s.before + 1, s.before + s.width
    from (
      select id, elimination_week
      from public.couples
      where season_id = v_season
        and status in ('eliminated', 'withdrawn')
        and elimination_week is not null
    ) m
    join (
      select
        elimination_week,
        width,
        coalesce(
          sum(width) over (
            order by elimination_week
            rows between unbounded preceding and 1 preceding
          ),
          0
        )::int as before
      from (
        select elimination_week, count(*)::int as width
        from public.couples
        where season_id = v_season
          and status in ('eliminated', 'withdrawn')
          and elimination_week is not null
        group by elimination_week
      ) weeks
    ) s on s.elimination_week = m.elimination_week;
  end if;

  insert into _sp_roster (manager_id, pts)
  select
    rs.manager_id,
    round(sum(
      coalesce(d.total, 0) * v_mult
      + case
          when o.outcome is not null and o.outcome not in ('eliminated', 'withdrawn', 'bye') then v_survival
          else 0
        end
      + case
          when o.outcome in ('eliminated', 'withdrawn', 'winner', 'runner_up', 'third_place')
            and rng.start_pos is not null
            and (v_total - rng.start_pos + 1) between 1 and 5
          then coalesce(
            (array[v_first, v_second, v_third, v_fourth, v_fifth])[v_total - rng.start_pos + 1],
            0
          )
          else 0
        end
      + coalesce(o.bonus_points, 0)
    )::numeric, 2)
  from public.roster_slots rs
  left join _sp_dances d on d.couple_id = rs.couple_id
  left join _sp_outcomes o on o.couple_id = rs.couple_id
  left join _sp_ranges rng on rng.couple_id = rs.couple_id
  where rs.league_id = p_league_id
    and rs.couple_id is not null
    and rs.start_week <= v_week_number
    and (rs.end_week is null or rs.end_week >= v_week_number)
  group by rs.manager_id;

  if v_full then
    insert into _sp_pred (manager_id, pts)
    select
      p.manager_id,
      round((
        public._sp_guess_points(
          case
            when p.predicted_eliminated_couple_id is null then 'miss'
            when exists (select 1 from _sp_elim e where e.couple_id = p.predicted_eliminated_couple_id) then 'exact'
            when exists (select 1 from _sp_jeopardy j where j.couple_id = p.predicted_eliminated_couple_id) then 'near_miss'
            else 'miss'
          end,
          v_elim_exact,
          v_near
        )
        + case when v_double then
            public._sp_guess_points(
              case
                when p.predicted_eliminated_couple_id_2 is null then 'miss'
                when exists (select 1 from _sp_elim e where e.couple_id = p.predicted_eliminated_couple_id_2) then 'exact'
                when exists (select 1 from _sp_jeopardy j where j.couple_id = p.predicted_eliminated_couple_id_2) then 'near_miss'
                else 'miss'
              end,
              v_elim_exact,
              v_near
            )
          else 0 end
        + public._sp_guess_points(
            case
              when p.predicted_top_scorer_couple_id is null then 'miss'
              when v_high > 0 and coalesce(d.total, -1) = v_high then 'exact'
              when d.couple_id is not null and v_high > 0 and d.total >= v_high - 1 and d.total < v_high then 'near_miss'
              else 'miss'
            end,
            v_top_exact,
            v_near
          )
      )::numeric, 2)
    from public.predictions p
    left join _sp_dances d on d.couple_id = p.predicted_top_scorer_couple_id
    where p.league_id = p_league_id and p.week_id = p_week_id;

    insert into _sp_gf (manager_id, pts)
    select
      scored.manager_id,
      round(round(sum(scored.points)::numeric, 2) * coalesce(scored.late_factor, 1), 2)
    from (
      select
        g.manager_id,
        u.late_factor,
        (
          select coalesce(max(
            public._sp_gf_at(
              g.predicted_position,
              pos,
              v_total,
              v_method,
              v_penalty,
              v_tier,
              v_style,
              v_ppc
            )
          ), 0)
          from generate_series(rng.start_pos, rng.end_pos) as pos
        ) as points
      from public.grand_finale_predictions g
      join _sp_outcomes o on o.couple_id = g.couple_id
        and o.outcome in ('eliminated', 'withdrawn', 'winner', 'runner_up', 'third_place')
      join _sp_ranges rng on rng.couple_id = g.couple_id
      left join public.grand_finale_late_unlocks u
        on u.league_id = g.league_id
        and u.manager_id = g.manager_id
        and u.submitted_at is not null
      where g.league_id = p_league_id
        and not (
          u.manager_id is not null
          and g.couple_id = any (u.ineligible_couple_ids)
        )
    ) scored
    group by scored.manager_id, scored.late_factor;
  end if;

  insert into public.weekly_manager_scores (
    league_id, manager_id, week_id,
    roster_points, prediction_points, grand_finale_points, total_points
  )
  select
    p_league_id,
    m.manager_id,
    p_week_id,
    coalesce(r.pts, 0),
    coalesce(p.pts, 0),
    coalesce(g.pts, 0),
    round((
      coalesce(r.pts, 0) * v_w_judges
      + coalesce(p.pts, 0) * v_w_elim
      + coalesce(g.pts, 0) * v_w_bonus
    )::numeric, 2)
  from (
    select manager_id from _sp_roster
    union
    select manager_id from _sp_pred
    union
    select manager_id from _sp_gf
  ) m
  left join _sp_roster r on r.manager_id = m.manager_id
  left join _sp_pred p on p.manager_id = m.manager_id
  left join _sp_gf g on g.manager_id = m.manager_id;
end;
$$;

create temp table _sp_ranges (
  couple_id uuid primary key,
  start_pos int not null,
  end_pos int not null
) on commit drop;
create temp table _sp_outcomes (
  couple_id uuid primary key,
  outcome text not null,
  bonus_points numeric not null
) on commit drop;
create temp table _sp_dances (
  couple_id uuid primary key,
  total numeric not null
) on commit drop;
create temp table _sp_elim (couple_id uuid primary key) on commit drop;
create temp table _sp_jeopardy (couple_id uuid primary key) on commit drop;
create temp table _sp_roster (manager_id uuid primary key, pts numeric not null) on commit drop;
create temp table _sp_pred (manager_id uuid primary key, pts numeric not null) on commit drop;
create temp table _sp_gf (manager_id uuid primary key, pts numeric not null) on commit drop;

do $$
declare
  r record;
begin
  for r in
    select l.id as league_id, w.id as week_id
    from public.leagues l
    join public.competition_weeks w on true
    where l.id in (
      'f38df148-85b2-4f06-89ae-6ef72b8fea2e',
      '3e0e38cd-823a-41af-a411-0ecf1fc88226',
      '8afa3b4f-a4d6-4e2d-902f-19716c41f7c4',
      'd18784af-378c-4d63-8000-d5928265aab1'
    )
      and (
        exists (
          select 1 from public.weekly_manager_scores s
          where s.league_id = l.id and s.week_id = w.id
        )
        or exists (
          select 1
          from public.episodes e
          where e.week_id = w.id
            and (
              e.results_published_at is not null
              or exists (select 1 from public.dance_scores d where d.episode_id = e.id)
              or exists (select 1 from public.episode_results er where er.episode_id = e.id)
            )
        )
      )
  loop
    perform public._sp_recompute_league_week(r.league_id, r.week_id);
  end loop;
end $$;

drop function public._sp_recompute_league_week(uuid, uuid);
drop function public._sp_guess_points(text, numeric, boolean);
drop function public._sp_gf_at(int, int, int, text, numeric, int, text, numeric);
drop function public._sp_band_fraction(int);

-- New leagues. Enabling Grand Finale seeds weight 1 and the calibrated
-- distance base. Column defaults cover survival, placement, and Curtain Call.
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
  v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I/L to avoid ambiguity
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

  -- Enabling Grand Finale seeds weight 1 (one full share). It does not
  -- redistribute Dance Card or Curtain Call. Points-per-correct is the
  -- distance-method default even when the module is off.
  insert into public.scoring_settings (
    league_id,
    judges_score_category_enabled,
    eliminations_category_enabled,
    bonus_picks_category_enabled,
    bonus_picks_category_weight,
    bonus_picks_scoring_method,
    bonus_picks_distance_penalty,
    bonus_picks_points_per_correct,
    scoring_configured
  )
  values (
    v_league.id,
    p_dance_card_enabled,
    p_curtain_call_enabled,
    v_grand_finale_enabled,
    1,
    case when v_grand_finale_enabled then 'distance_based' end,
    case when v_grand_finale_enabled then 2.08 end,
    8.33,
    true
  );

  return v_league;
end;
$$;

-- Review after the run. Weights and enabled flags should match what they
-- were before; point budgets should match the numbers above.
select
  l.name,
  l.roster_size,
  ss.judges_score_category_enabled,
  ss.eliminations_category_enabled,
  ss.bonus_picks_category_enabled,
  ss.judges_score_category_weight,
  ss.eliminations_category_weight,
  ss.bonus_picks_category_weight,
  ss.judges_score_multiplier,
  ss.survival_points,
  ss.elimination_prediction_points,
  ss.top_scorer_prediction_points,
  ss.first_place_points,
  ss.bonus_picks_scoring_method,
  ss.bonus_picks_points_per_correct,
  ss.bonus_picks_distance_penalty,
  ss.judges_score_multiplier_customized
from public.leagues l
join public.scoring_settings ss on ss.league_id = l.id
where l.id in (
  'f38df148-85b2-4f06-89ae-6ef72b8fea2e',
  '3e0e38cd-823a-41af-a411-0ecf1fc88226',
  '8afa3b4f-a4d6-4e2d-902f-19716c41f7c4',
  'd18784af-378c-4d63-8000-d5928265aab1'
)
order by l.name;

commit;
