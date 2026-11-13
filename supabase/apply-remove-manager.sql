-- Removing a manager after the draft releases their roster (Kylie,
-- 2026-11-12, docs/design/remove-manager/plan.md). Until now
-- remove_league_member and leave_league deleted the membership row and
-- nothing else, leaving a ghost team: its couples stayed held on the wire
-- for good, it kept earning score rows nobody could see, and its claims
-- and trade offers died at the next run.
--
-- A removal is a drop of the whole roster at the effective week (the first
-- week whose first night hasn't aired; after the last one, the week after
-- the season, so they keep the Finale). Weeks that have aired are wholly
-- theirs and still score; from the effective week the couples are nobody's
-- and free on the wire. Their published history, Lifeline payouts, the
-- Equalizer and their Grand Finale bracket stay, so a correction republish
-- of an earlier week computes the same row. Their claims, Lifeline picks
-- and Curtain Call picks for weeks not yet aired go, and any trade offer
-- they are in is called off now, with the reason on the Trade Log.
--
-- Apply after apply-trades.sql and apply-lifeline.sql. Safe to run again.

begin;

-- The log of released couples. The name is stored at release time because
-- the league's own name lookups only know current members.
create table if not exists public.roster_releases (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  manager_id uuid not null references public.profiles(id),
  manager_name text not null,
  couple_id uuid not null references public.couples(id),
  -- The couple is nobody's from this week.
  week_number int not null,
  released_at timestamptz not null default now()
);
alter table public.roster_releases enable row level security;
drop policy if exists "roster releases are viewable by league members" on public.roster_releases;
create policy "roster releases are viewable by league members"
on public.roster_releases for select using (public.is_league_member(league_id));
revoke all on public.roster_releases from anon, authenticated;
grant select on public.roster_releases to authenticated;
grant select, insert, update, delete on public.roster_releases to service_role;

-- Who left a drafted league, so the invite code can refuse them whether or
-- not they ever held a roster or scored. Cleared with a draft reset.
create table if not exists public.league_departures (
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  left_at timestamptz not null default now(),
  primary key (league_id, user_id)
);
alter table public.league_departures enable row level security;
revoke all on public.league_departures from anon, authenticated;
grant select, insert, update, delete on public.league_departures to service_role;

-- The first week of the season whose first night hasn't aired, as
-- recast_next_cycle reckons a run's start week with the run taken as now.
-- Once every week's first night has aired there is none: the week after
-- the last one, so a removal between the Finale's nights keeps the Finale.
create or replace function public.release_effective_week()
returns int
language sql
stable
set search_path = ''
as $$
  with weeks as (
    select w.week_number, min(e.airs_at) as first_airs_at
    from public.competition_weeks w
    join public.episodes e on e.week_id = w.id
    where w.season_id = public.active_season_id()
    group by w.week_number
  )
  select coalesce(
    (select min(week_number) from weeks where first_airs_at is null or first_airs_at > now()),
    (select max(week_number) from weeks) + 1,
    1
  );
$$;
revoke all on function public.release_effective_week() from public, anon, authenticated;
grant execute on function public.release_effective_week() to service_role;

-- Takes a team off the league. The caller has already authorized the
-- removal and holds the leagues row lock, so this can't interleave with a
-- waiver run, a trade or a list save. Returns how many couples were freed.
create or replace function public.release_team(p_league_id uuid, p_user_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season uuid := public.active_season_id();
  v_week int := public.release_effective_week();
  v_name text;
  v_released int;
  v_trade record;
begin
  select coalesce(display_name, 'A manager') into v_name from public.profiles where id = p_user_id;

  -- The couples they hold at the boundary. A row that starts at or after
  -- the effective week (a claim they won for a week not yet aired, or a
  -- trade's incoming couple) was never theirs on air and is just deleted;
  -- every row reaching into the effective week, open or already closed
  -- later, ends the week before it. Leaving a closed row that reaches past
  -- the boundary would let two managers score the couple in one week.
  insert into public.roster_releases (league_id, manager_id, manager_name, couple_id, week_number)
  select distinct p_league_id, p_user_id, v_name, rs.couple_id, v_week
  from public.roster_slots rs
  join public.couples c on c.id = rs.couple_id and c.season_id = v_season
  where rs.league_id = p_league_id and rs.manager_id = p_user_id
    and rs.start_week < v_week and (rs.end_week is null or rs.end_week >= v_week);
  get diagnostics v_released = row_count;

  -- This season's rows only: week numbers repeat across seasons.
  delete from public.roster_slots rs
  using public.couples c
  where c.id = rs.couple_id and c.season_id = v_season
    and rs.league_id = p_league_id and rs.manager_id = p_user_id and rs.start_week >= v_week;
  update public.roster_slots rs
  set end_week = v_week - 1
  from public.couples c
  where c.id = rs.couple_id and c.season_id = v_season
    and rs.league_id = p_league_id and rs.manager_id = p_user_id
    and rs.start_week < v_week and (rs.end_week is null or rs.end_week >= v_week);

  delete from public.waiver_claims
  where league_id = p_league_id and manager_id = p_user_id and status = 'pending';
  delete from public.draft_queues where league_id = p_league_id and user_id = p_user_id;

  -- Picks for weeks that haven't aired earn nothing yet. The bracket stays:
  -- a correction republish rebuilds a week's Grand Finale points from it.
  delete from public.lifeline_picks p
  using public.competition_weeks w
  where w.id = p.week_id and w.season_id = v_season
    and p.league_id = p_league_id and p.manager_id = p_user_id and w.week_number >= v_week;
  delete from public.predictions p
  using public.competition_weeks w
  where w.id = p.week_id and w.season_id = v_season
    and p.league_id = p_league_id and p.manager_id = p_user_id and w.week_number >= v_week;
  delete from public.grand_finale_late_unlocks
  where league_id = p_league_id and manager_id = p_user_id and submitted_at is null;

  -- Every offer they are in is called off now rather than failing at the
  -- run, in one statement so a response in flight re-checks the status.
  update public.trade_offers t
  set status = case t.status when 'proposed' then 'cancelled' else 'failed' end,
      result = case t.status when 'accepted' then 'left_league' end,
      resolved_at = now(),
      -- The Trade Log gates by week; this is the last week they held.
      week_number = coalesce(t.week_number, v_week - 1)
  where t.league_id = p_league_id and t.status in ('proposed', 'accepted')
    and exists (select 1 from public.trade_parties p where p.trade_id = t.id and p.manager_id = p_user_id);

  delete from public.league_members where league_id = p_league_id and user_id = p_user_id;
  insert into public.league_departures (league_id, user_id) values (p_league_id, p_user_id)
  on conflict (league_id, user_id) do update set left_at = now();

  -- With one team fewer, votes already cast on an accepted trade may now be
  -- a majority; veto_trade only tests that when a vote is cast.
  for v_trade in
    select id from public.trade_offers
    where league_id = p_league_id and status = 'accepted' and veto_ends_at > now()
  loop
    if (
      select count(*) from public.trade_votes v
      join public.league_members m on m.league_id = p_league_id and m.user_id = v.manager_id
      where v.trade_id = v_trade.id
    ) * 2 > (
      select count(*) from public.league_members m
      where m.league_id = p_league_id and not exists (
        select 1 from public.trade_parties p where p.trade_id = v_trade.id and p.manager_id = m.user_id
      )
    ) then
      update public.trade_offers set status = 'vetoed', resolved_at = now() where id = v_trade.id;
    end if;
  end loop;

  return v_released;
end;
$$;
revoke all on function public.release_team(uuid, uuid) from public, anon, authenticated;

create or replace function public.remove_league_member(p_league_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Only the commissioner can remove a member';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Use Leave League to remove yourself';
  end if;
  -- Serializes with the waiver run, trades and list saves.
  perform 1 from public.leagues where id = p_league_id for update;
  if exists (select 1 from public.leagues where id = p_league_id and draft_status = 'in_progress') then
    raise exception 'Draft in progress — ask the commissioner to cancel it first';
  end if;
  -- Held until the delete, so a promotion in flight can't slip between
  -- the role check and the removal.
  perform 1 from public.league_members
  where league_id = p_league_id and user_id = p_user_id and role <> 'commissioner'
  for update;
  if not found then
    raise exception 'That person is not a removable member of this league';
  end if;
  perform public.release_team(p_league_id, p_user_id);
end;
$$;
revoke execute on function public.remove_league_member(uuid, uuid) from public, anon;
grant execute on function public.remove_league_member(uuid, uuid) to authenticated;

create or replace function public.leave_league(p_league_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.league_members where league_id = p_league_id and co_manager_id = auth.uid()
  ) then
    raise exception 'Use "Leave as co-manager" instead';
  end if;
  if public.is_league_commissioner(p_league_id) then
    raise exception 'Commissioners can''t leave their own league';
  end if;
  perform 1 from public.leagues where id = p_league_id for update;
  if exists (select 1 from public.leagues where id = p_league_id and draft_status = 'in_progress') then
    raise exception 'Draft in progress — ask the commissioner to cancel it first';
  end if;
  if exists (
    select 1 from public.league_members
    where league_id = p_league_id and user_id = auth.uid() and co_manager_id is not null
  ) then
    raise exception 'Detach your co-manager before leaving';
  end if;
  if not exists (select 1 from public.league_members where league_id = p_league_id and user_id = auth.uid()) then
    raise exception 'You are not a member of this league';
  end if;
  perform public.release_team(p_league_id, auth.uid());
end;
$$;
revoke execute on function public.leave_league(uuid) from public, anon;
grant execute on function public.leave_league(uuid) to authenticated;

-- Every team table is keyed by the user id, so a removed manager who joined
-- again after the draft would reconnect to their old score rows with no
-- roster. Once the draft is complete, a user with history in the league
-- can't come back through the invite code.
create or replace function public.join_league(p_invite_code text)
returns public.leagues
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league public.leagues;
begin
  -- Serializes with a removal of this same user.
  select * into v_league from public.leagues where invite_code = trim(upper(p_invite_code)) for update;
  if not found then
    raise exception 'Invite code not found';
  end if;
  if v_league.draft_status = 'in_progress' then
    raise exception 'Draft in progress — ask the commissioner to cancel it first';
  end if;
  if v_league.draft_status = 'completed'
     and exists (select 1 from public.league_departures where league_id = v_league.id and user_id = auth.uid()) then
    raise exception 'You were removed from this league after its draft';
  end if;
  insert into public.league_members (league_id, user_id, role)
  values (v_league.id, auth.uid(), 'manager')
  on conflict (league_id, user_id) do nothing;
  return v_league;
end;
$$;
revoke execute on function public.join_league(text) from public, anon;
grant execute on function public.join_league(text) to authenticated;

-- A pick, claim or offer saved by a team that is removed before its
-- transaction commits must not land: these writers check membership
-- before they take the league lock (Lifeline's take none), so the check is
-- repeated at commit against the committed membership.
create or replace function public.assert_team_is_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_league uuid;
begin
  -- Read by name through jsonb: the three tables share no column layout.
  v_league := case tg_table_name
    when 'trade_parties' then (select league_id from public.trade_offers where id = (v_row->>'trade_id')::uuid)
    else (v_row->>'league_id')::uuid
  end;
  -- Waits on a removal holding the league row, then reads the membership
  -- it left; a removal that starts after this waits for this commit and
  -- then cleans the row up itself.
  perform 1 from public.leagues where id = v_league for share;
  if not exists (
    select 1 from public.league_members where league_id = v_league and user_id = (v_row->>'manager_id')::uuid
  ) then
    raise exception 'That team is no longer in this league';
  end if;
  return new;
end;
$$;
drop trigger if exists lifeline_picks_team_is_member on public.lifeline_picks;
create constraint trigger lifeline_picks_team_is_member
  after insert or update on public.lifeline_picks
  deferrable initially deferred for each row execute function public.assert_team_is_member();
drop trigger if exists waiver_claims_team_is_member on public.waiver_claims;
create constraint trigger waiver_claims_team_is_member
  after insert on public.waiver_claims
  deferrable initially deferred for each row execute function public.assert_team_is_member();
drop trigger if exists trade_parties_team_is_member on public.trade_parties;
create constraint trigger trade_parties_team_is_member
  after insert on public.trade_parties
  deferrable initially deferred for each row execute function public.assert_team_is_member();

-- The release log goes with the roster on a draft reset.
create or replace function public.reset_draft(p_league_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
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
  delete from public.roster_releases where league_id = p_league_id;
  delete from public.league_departures where league_id = p_league_id;
  delete from public.roster_slots where league_id = p_league_id;
  delete from public.draft_picks where league_id = p_league_id;
  update public.leagues
  set draft_status = 'not_started', current_turn_started_at = null
  where id = p_league_id;
end;
$$;
revoke execute on function public.reset_draft(uuid) from public, anon;
grant execute on function public.reset_draft(uuid) to authenticated;

commit;
