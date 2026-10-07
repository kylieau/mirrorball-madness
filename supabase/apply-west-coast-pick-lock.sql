-- West Coast leagues: a league can lock Curtain Call relative to the 8pm PT
-- West feed instead of the East broadcast (prediction_lock_coast), and the
-- lock can now fall after the curtain (a negative
-- prediction_lock_hours_before_air). Either way it is capped at the end of
-- that coast's broadcast (episodes.duration_minutes), so picks never stay
-- open once the elimination has been announced. The Grand Finale deadline
-- stays on East time.

alter table public.leagues
  add column prediction_lock_coast text not null default 'east'
    check (prediction_lock_coast in ('east', 'west'));

comment on column public.leagues.prediction_lock_coast is
  'Which broadcast Curtain Call locks against: east = episodes.airs_at, west = 8pm PT on that air date.';

-- Found by definition rather than by name, since it was created inline.
do $$
declare
  v_name text;
begin
  select conname into v_name
  from pg_constraint
  where conrelid = 'public.leagues'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%prediction_lock_hours_before_air%';
  if v_name is not null then
    execute format('alter table public.leagues drop constraint %I', v_name);
  end if;
end;
$$;

comment on column public.leagues.prediction_lock_hours_before_air is
  'Hours before this league''s curtain (prediction_lock_coast) that Curtain Call locks; negative = after the curtain, capped at the broadcast''s end.';

create or replace function public.prediction_lock_at(p_league_id uuid, p_week_id uuid)
returns timestamptz
language sql
security definer
set search_path = ''
stable
as $$
  with first_night as (
    select e.airs_at, e.duration_minutes
    from public.episodes e
    where e.week_id = p_week_id
    order by e.airs_at
    limit 1
  ),
  curtain as (
    select
      case
        when l.prediction_lock_coast = 'west'
          then ((n.airs_at at time zone 'America/Los_Angeles')::date + time '20:00') at time zone 'America/Los_Angeles'
        else n.airs_at
      end as at,
      n.duration_minutes,
      l.prediction_lock_hours_before_air as hours_before
    from first_night n
    cross join public.leagues l
    where l.id = p_league_id
  )
  select least(
    c.at - c.hours_before * interval '1 hour',
    c.at + c.duration_minutes * interval '1 minute'
  )
  from curtain c;
$$;

drop function public.update_league_settings(uuid, text, text, int, numeric, text, timestamptz);

create function public.update_league_settings(
  p_league_id uuid,
  p_waiver_mode text,
  p_waiver_claim_method text,
  p_pick_time_limit_seconds int,
  p_prediction_lock_hours_before_air numeric,
  p_prediction_lock_coast text,
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
    prediction_lock_coast = p_prediction_lock_coast,
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

revoke execute on function public.update_league_settings(uuid, text, text, int, numeric, text, text, timestamptz) from public;
grant execute on function public.update_league_settings(uuid, text, text, int, numeric, text, text, timestamptz) to authenticated;
