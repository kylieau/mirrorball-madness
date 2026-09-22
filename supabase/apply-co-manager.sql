-- Co-manager: a second person (a duo, max 2) can jointly run one fantasy
-- team with full parity — either person can draft, submit predictions, edit
-- the queue, everything. Kept contained: team-scoped tables (draft_picks,
-- roster_slots, predictions, grand_finale_predictions, draft_queues,
-- weekly_manager_scores, waiver_claims) keep storing the PRIMARY manager's
-- user_id as the team identity, unchanged. A co-manager's auth.uid() is
-- resolved back to that primary id before every write, via
-- resolve_acting_league_member below, so no downstream table needs a schema
-- change and draft turn order (keyed on the primary user_id) needs no logic
-- change either.
--
-- Run in the Supabase Dashboard SQL Editor, then regenerate
-- src/lib/supabase/types.ts.

begin;

alter table public.league_members
  add column if not exists co_manager_id uuid,
  add column if not exists co_manager_invite_code text;

alter table public.league_members
  drop constraint if exists league_members_co_manager_id_fkey;

alter table public.league_members
  add constraint league_members_co_manager_id_fkey
  foreign key (co_manager_id) references public.profiles(id);

alter table public.league_members
  drop constraint if exists league_members_co_manager_not_self;

alter table public.league_members
  add constraint league_members_co_manager_not_self
  check (co_manager_id is distinct from user_id);

-- One person can be co-manager of at most one team per league (mirrors the
-- existing unique(league_id, user_id) for primaries). Deliberately not
-- globally unique — same as primaries, nothing stops someone co-managing in
-- one league while primary/co-manager elsewhere.
create unique index if not exists league_members_co_manager_unique
  on public.league_members (league_id, co_manager_id)
  where co_manager_id is not null;

create unique index if not exists league_members_co_manager_invite_code_unique
  on public.league_members (co_manager_invite_code)
  where co_manager_invite_code is not null;

-- ============================================================
-- is_league_member / is_league_commissioner: broadened to match a
-- co-manager's auth.uid() too, since these gate nearly every league-scoped
-- RLS policy and permission check.
-- ============================================================

create or replace function public.is_league_member(p_league_id uuid)
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

create or replace function public.is_league_commissioner(p_league_id uuid)
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

-- ============================================================
-- RLS policies that compare auth.uid() directly against a column instead of
-- routing through is_league_member/is_league_commissioner — these need an
-- explicit co-manager fix, the two functions above don't cover them.
-- ============================================================

drop policy if exists "profiles are viewable by fellow league members" on public.profiles;

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

drop policy if exists "draft queues are viewable by their owner" on public.draft_queues;

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

drop policy if exists "predictions visible to owner pre-lock, league post-lock" on public.predictions;

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

drop policy if exists "grand finale predictions visible to owner pre-deadline, league post-deadline" on public.grand_finale_predictions;

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

-- ============================================================
-- Write RPCs that took auth.uid() directly as the manager identity being
-- written/compared — swapped to resolve_acting_league_member so either
-- half of a co-managed team acts as the same team.
-- ============================================================

create or replace function public.make_draft_pick(p_league_id uuid, p_couple_id uuid)
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

create or replace function public.set_draft_autopilot(p_league_id uuid, p_enabled boolean)
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

create or replace function public.set_draft_queue(p_league_id uuid, p_couple_ids uuid[])
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

create or replace function public.submit_grand_finale_prediction(p_league_id uuid, p_couple_ids uuid[])
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

-- ============================================================
-- leave_league: a co-manager calling this today would hit a misleading
-- "not found" (it only ever matched user_id). A co-manager's own "leave" now
-- routes through remove_co_manager instead; a primary can't leave while a
-- co-manager is still attached (detach first) — user_id is the permanent
-- identity six other tables hang their history off, so auto-promoting the
-- co-manager into it would either orphan history under the old id or
-- require rewriting rows across draft_picks/roster_slots/predictions/
-- grand_finale_predictions/weekly_manager_scores/draft_queues. Blocking
-- keeps "co_manager_id attaches/detaches with zero data migration" as the
-- clean invariant.
-- ============================================================

create or replace function public.leave_league(p_league_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
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

  if exists (
    select 1 from public.league_members
    where league_id = p_league_id and co_manager_id = auth.uid()
  ) then
    raise exception 'Use "Leave as co-manager" instead';
  end if;

  delete from public.league_members
  where league_id = p_league_id and user_id = auth.uid();

  if not found then
    raise exception 'You are not a member of this league';
  end if;
end;
$$;

-- ============================================================
-- Co-manager invite / join / remove. Self-service: the primary manager
-- mints a per-team code from their own row (same charset/collision-loop
-- style as create_league's league-wide invite_code), shares it out-of-band,
-- and the recipient redeems it. remove_league_member needs no change — it
-- deletes the whole row, which already detaches both people in one shot.
-- ============================================================

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

commit;
