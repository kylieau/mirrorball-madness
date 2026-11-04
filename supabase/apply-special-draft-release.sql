-- Draft release for special dances: a contributor (propose tier) releases a
-- fully scored special dance before it is posted, the same way a couple's
-- drafted dance is released, and fans who unlocked that week's drafts see it.
--
-- 1. draft_special_releases, one row per released special dance. Signed-in
--    users may read it (it holds no scores) so the live-air prompt and the
--    draft strip know a draft is out; the policy is required, since RLS with
--    no policy returns zero rows.
-- 2. set_special_draft_release (service only, propose tier through
--    assert_episode_draft_actor) releases or withdraws one dance. It refuses a
--    published episode, a posted dance and a dance that is not fully scored.
-- 3. visible_draft_special_scores() returns a released dance's rows exactly as
--    posting would write them (materialize_team_scores): one row per eligible
--    participant, marks over the panel's possible (scaled to 30), or points
--    with max 0. Only for weeks the caller unlocked, only while the dance is
--    unposted, fully scored and its episode unpublished. A Points dance's
--    Result text (Winner, Loser) is never returned.
--
-- Posting, Finish Week and the couple reveal are unchanged. A posted dance
-- and a published episode hide a release; un-posting brings it back, as it
-- does for a couple. Additive, so it can run before or after the deploy.
-- Safe to rerun.
begin;

create table if not exists public.draft_special_releases (
  team_id uuid primary key references public.episode_teams(id) on delete cascade,
  episode_id uuid not null references public.episodes(id) on delete cascade,
  released_at timestamptz not null default now(),
  released_by uuid references public.profiles(id) on delete set null
);
revoke all on public.draft_special_releases from public, anon, authenticated;
grant select on public.draft_special_releases to authenticated;
grant all on public.draft_special_releases to service_role;
alter table public.draft_special_releases enable row level security;
drop policy if exists "draft special releases are viewable by all authenticated users" on public.draft_special_releases;
create policy "draft special releases are viewable by all authenticated users"
on public.draft_special_releases for select
to authenticated
using (true);

create or replace function public.set_special_draft_release(p_episode_id uuid, p_team_id uuid, p_actor_id uuid, p_release boolean)
returns void language plpgsql security invoker set search_path = '' as $$
declare team public.episode_teams; v_blocker text;
begin
  perform public.assert_episode_draft_actor(p_episode_id, p_actor_id);
  if exists (select 1 from public.episodes where id = p_episode_id and results_published_at is not null) then
    raise exception 'This episode is already published';
  end if;
  select * into team from public.episode_teams where id = p_team_id and episode_id = p_episode_id for update;
  if team.id is null then raise exception 'That special dance is no longer on this episode'; end if;
  if p_release then
    if team.posted_at is not null then raise exception '% is already posted', public.special_dance_label(team); end if;
    v_blocker := public.special_dance_blocker(team.id, 'before releasing it');
    if v_blocker is not null then raise exception '%', v_blocker; end if;
    insert into public.draft_special_releases (team_id, episode_id, released_by) values (team.id, p_episode_id, p_actor_id)
    on conflict (team_id) do update set released_at = now(), released_by = p_actor_id;
  else
    delete from public.draft_special_releases where team_id = team.id;
  end if;
end;
$$;
revoke all on function public.set_special_draft_release(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_special_draft_release(uuid, uuid, uuid, boolean) to service_role;

create or replace function public.visible_draft_special_scores()
returns table (
  episode_id uuid,
  week_id uuid,
  week_number int,
  team_id uuid,
  couple_id uuid,
  dance_style_name text,
  total_score numeric,
  scaled_score numeric,
  max_score numeric,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with released as (
    select t.*, r.released_at, e.week_id, w.week_number, s.name as style_name
    from public.draft_special_releases r
    join public.episode_teams t on t.id = r.team_id and t.episode_id = r.episode_id
    join public.episodes e on e.id = r.episode_id
    join public.competition_weeks w on w.id = e.week_id
    join public.dance_styles s on s.id = t.dance_style_id
    join public.spoiler_watch_progress p on p.user_id = auth.uid() and p.season_id = e.season_id
    where e.results_published_at is null
      and t.posted_at is null
      and p.draft_unlocked_week >= w.week_number
      and public.special_dance_complete(t.id)
  ),
  marks as (
    select r.id as team_id, sum(k.score) as total, cardinality(public.special_dance_panel(r.id)) * 10 as max_score
    from released r
    join public.episode_team_marks k on k.team_id = r.id and k.judge_id = any(public.special_dance_panel(r.id))
    where r.scoring_mode = 'marks'
    group by r.id
  )
  select r.episode_id, r.week_id, r.week_number, r.id, m.couple_id, r.style_name,
    case when r.scoring_mode = 'points' then sc.points else k.total end,
    case when r.scoring_mode = 'points' then 0 else k.total * 30 / k.max_score end,
    case when r.scoring_mode = 'points' then 0 else k.max_score end,
    r.released_at
  from released r
  cross join lateral public.team_eligible_members(r.episode_id, r.id) as m(couple_id)
  left join marks k on k.team_id = r.id
  left join public.episode_team_scores sc on sc.team_id = r.id and sc.couple_id = m.couple_id;
$$;
revoke all on function public.visible_draft_special_scores() from public, anon;
grant execute on function public.visible_draft_special_scores() to authenticated;

commit;

-- After running, expect one row each:
--   select to_regclass('public.draft_special_releases');
--   select proname from pg_proc where proname in ('set_special_draft_release', 'visible_draft_special_scores');
