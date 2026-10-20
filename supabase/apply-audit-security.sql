-- Mirrorball Madness (wssbwgtsejamlbvfofvu). Apply before the associated app deployment.
-- No historical predictions or standings are modified. Review active corrections first.
begin;
alter table public.profiles add column if not exists can_propose_results boolean not null default false;
alter table public.league_members add column if not exists co_manager_invite_expires_at timestamptz;
alter table public.draft_episode_overrides add column if not exists correction_token uuid;
alter table public.draft_episode_overrides add column if not exists correction_base_published_at timestamptz;
-- Previously exposed invitations must be reissued by their owners.
update public.league_members set co_manager_invite_code = null, co_manager_invite_expires_at = null where co_manager_invite_code is not null and co_manager_invite_expires_at is null;
-- Preserve already-open correction sessions; completeness is checked at commit.
update public.draft_episode_overrides d set correction_token = gen_random_uuid(), correction_base_published_at = e.results_published_at
from public.episodes e where e.id = d.episode_id and e.results_published_at is not null and d.correction_token is null;
revoke select on public.league_members from authenticated;
grant select (id, league_id, user_id, role, draft_position, draft_autopilot, co_manager_id, joined_at) on public.league_members to authenticated;
create or replace function public.generate_co_manager_invite_code(p_league_id uuid)
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

  update public.league_members set co_manager_invite_code = v_code, co_manager_invite_expires_at = now() + interval '7 days' where id = v_row.id;

  return v_code;
end;
$$;

create or replace function public.join_as_co_manager(p_code text)
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
    and co_manager_invite_expires_at > now()
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
  set co_manager_id = auth.uid(), co_manager_invite_code = null, co_manager_invite_expires_at = null
  where id = v_row.id;

  return v_league;
end;
$$;

create or replace function public.get_co_manager_invite_info(p_code text)
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
    and lm.co_manager_invite_expires_at > now()
  limit 1;
$$;

create or replace function public.episode_publication_snapshot(p_episode_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select payload || jsonb_build_object('_revision', md5(payload::text))
  from (select jsonb_build_object(
    'season', (select to_jsonb(s) from public.seasons s where is_active limit 1),
    'episodes', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.episodes where season_id = (select id from public.seasons where is_active limit 1)) r),
    'weeks', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.competition_weeks where season_id = (select id from public.seasons where is_active limit 1)) r),
    'couples', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.couples where season_id = (select id from public.seasons where is_active limit 1)) r),
    'dances', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.dance_scores where episode_id in (select id from public.episodes where season_id = (select id from public.seasons where is_active limit 1))) r),
    'outcomes', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.episode_results where episode_id in (select id from public.episodes where season_id = (select id from public.seasons where is_active limit 1))) r),
    'jeopardy', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.episode_in_jeopardy_couples where episode_id in (select id from public.episodes where season_id = (select id from public.seasons where is_active limit 1))) r),
    'leagues', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.leagues) r),
    'settings', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.scoring_settings) r),
    'rosters', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.roster_slots) r),
    'predictions', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.predictions where week_id = (select week_id from public.episodes where id = p_episode_id)) r),
    'lateUnlocks', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.grand_finale_late_unlocks) r),
    'weeklyScores', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.weekly_manager_scores where week_id = (select week_id from public.episodes where id = p_episode_id)) r),
    'grandFinalePredictions', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.grand_finale_predictions) r),
    'draftOverrides', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.draft_episode_overrides where episode_id = p_episode_id) r),
    'draftDances', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.draft_dance_scores where episode_id = p_episode_id) r),
    'draftJudges', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.draft_judge_scores where draft_dance_score_id in (select id from public.draft_dance_scores where episode_id = p_episode_id)) r),
    'draftResults', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.draft_episode_results where episode_id = p_episode_id) r),
    'draftJeopardy', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.draft_episode_in_jeopardy_couples where episode_id = p_episode_id) r),
    'draftMoments', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.draft_episode_custom_moments where episode_id = p_episode_id) r)
  ) as payload) snapshot;
$$;

create or replace function public.commit_episode_publication(
  p_episode_id uuid, p_published_by uuid, p_snapshot jsonb, p_plan jsonb
)
returns void language plpgsql security invoker
set search_path = '' set lock_timeout = '5s'
as $$
declare
  v_episode public.episodes%rowtype;
  v_override public.draft_episode_overrides%rowtype;
  v_draft public.draft_dance_scores%rowtype;
  v_dance_id uuid;
  v_preserved uuid[];
  v_departed uuid[];
  v_future uuid[];
begin
  -- Hold these only for the commit, never while TypeScript calculates scores.
  -- Other result saves, settings edits and picks must finish before we compare
  -- the snapshot; they cannot race the write once the comparison succeeds.
  perform 1 from public.episodes where id=p_episode_id for update;
  lock table public.seasons, public.episodes, public.competition_weeks,
    public.couples, public.dance_scores, public.judge_scores,
    public.episode_results, public.episode_in_jeopardy_couples,
    public.leagues, public.scoring_settings, public.roster_slots,
    public.predictions, public.grand_finale_late_unlocks,
    public.grand_finale_predictions, public.draft_episode_overrides,
    public.draft_dance_scores, public.draft_judge_scores,
    public.draft_episode_results, public.draft_episode_in_jeopardy_couples,
    public.draft_episode_custom_moments, public.episode_participants,
    public.episode_custom_moments, public.draft_couple_releases,
    public.weekly_manager_scores in share row exclusive mode;

  if not exists (select 1 from public.profiles where id = p_published_by and is_super_admin) then
    raise exception 'Not authorized to publish results';
  end if;
  if p_snapshot is null or p_snapshot->>'_revision' is null or p_snapshot->>'_revision' is distinct from public.episode_publication_snapshot(p_episode_id)->>'_revision' then
    raise exception 'Results or scoring inputs changed. Refresh and try again.';
  end if;
  select * into strict v_episode from public.episodes where id = p_episode_id;
  select * into strict v_override from public.draft_episode_overrides where episode_id = p_episode_id;
  if v_episode.results_published_at is not null and (
    exists (select 1 from public.episode_results live where live.episode_id = p_episode_id
      and not exists (select 1 from public.draft_episode_results draft where draft.episode_id = p_episode_id and draft.couple_id = live.couple_id))
    or exists (select 1 from public.dance_scores live where live.episode_id = p_episode_id
      and not exists (select 1 from public.draft_dance_scores draft where draft.episode_id = p_episode_id and draft.couple_id = live.couple_id)
      and not exists (select 1 from public.draft_episode_results draft where draft.episode_id = p_episode_id and draft.couple_id = live.couple_id and draft.outcome = 'bye'))
  ) then raise exception 'Incomplete correction draft. Reload the complete published episode before correcting it.'; end if;

  if not exists (select 1 from public.draft_episode_results where episode_id = p_episode_id) then
    raise exception 'No results to publish for this episode';
  end if;

  select coalesce(array_agg(distinct couple_id), '{}'::uuid[]) into v_preserved
  from public.dance_scores where episode_id = p_episode_id and v_episode.results_published_at is null;
  if cardinality(v_preserved) > 0 and exists (
    select 1 from public.draft_dance_scores where episode_id = p_episode_id and not (couple_id = any(v_preserved))
  ) then raise exception 'Post every couple before publishing results'; end if;

  delete from public.dance_scores where episode_id = p_episode_id and not (couple_id = any(v_preserved));
  for v_draft in select * from public.draft_dance_scores where episode_id = p_episode_id and not (couple_id = any(v_preserved)) loop
    insert into public.dance_scores (episode_id, couple_id, dance_style_id, song_title, total_score, scaled_score)
    select p_episode_id, v_draft.couple_id, v_draft.dance_style_id, v_draft.song_title,
      coalesce(sum(score), 0), coalesce(sum(score) * 3.0 / nullif(count(*), 0), 0)
    from public.draft_judge_scores where draft_dance_score_id = v_draft.id
    returning id into v_dance_id;
    insert into public.judge_scores (dance_score_id, judge_id, score)
    select v_dance_id, judge_id, score from public.draft_judge_scores where draft_dance_score_id = v_draft.id;
  end loop;

  delete from public.episode_results where episode_id = p_episode_id;
  insert into public.episode_results (episode_id, couple_id, outcome, saved_by_judges, had_immunity, bonus_points, bonus_note)
  select episode_id, couple_id, outcome, saved_by_judges, had_immunity, bonus_points, bonus_note
  from public.draft_episode_results where episode_id = p_episode_id;
  delete from public.episode_in_jeopardy_couples where episode_id = p_episode_id;
  insert into public.episode_in_jeopardy_couples (episode_id, couple_id)
  select j.episode_id, j.couple_id from public.draft_episode_in_jeopardy_couples j
  where j.episode_id = p_episode_id and not exists (
    select 1 from public.draft_episode_results r where r.episode_id = p_episode_id and r.couple_id = j.couple_id and r.outcome = 'eliminated'
  );

  update public.couples c set status = u.status, elimination_week = u.elimination_week
  from jsonb_to_recordset(p_plan->'coupleUpdates') as u(id uuid, status text, elimination_week int)
  where c.id = u.id and c.season_id = v_episode.season_id;
  select coalesce(array_agg(couple_id), '{}'::uuid[]) into v_departed from public.draft_episode_results
  where episode_id = p_episode_id and outcome in ('eliminated', 'withdrawn', 'winner', 'runner_up', 'third_place');
  select coalesce(array_agg(value::uuid), '{}'::uuid[]) into v_future from jsonb_array_elements_text(p_plan->'futureEpisodeIds');
  delete from public.episode_participants where episode_id = any(v_future) and couple_id = any(v_departed);
  delete from public.draft_episode_results where episode_id = any(v_future) and couple_id = any(v_departed);
  delete from public.draft_dance_scores where episode_id = any(v_future) and couple_id = any(v_departed);
  delete from public.draft_episode_custom_moments where episode_id = any(v_future) and couple_id = any(v_departed);

  if v_episode.week_id is not null then
    if exists (select 1 from jsonb_to_recordset(p_plan->'weeklyScores') as s(week_id uuid) where week_id is distinct from v_episode.week_id) then
      raise exception 'Score rows must belong to this competition week';
    end if;
    delete from public.weekly_manager_scores where week_id = v_episode.week_id;
    insert into public.weekly_manager_scores (league_id, manager_id, week_id, roster_points, prediction_points, grand_finale_points, total_points)
    select league_id, manager_id, week_id, roster_points, prediction_points, grand_finale_points, total_points
    from jsonb_to_recordset(p_plan->'weeklyScores') as s(league_id uuid, manager_id uuid, week_id uuid, roster_points numeric, prediction_points numeric, grand_finale_points numeric, total_points numeric);
  end if;
  delete from public.episode_custom_moments where episode_id = p_episode_id;
  insert into public.episode_custom_moments (episode_id, couple_id, label, created_by)
  select episode_id, couple_id, label, p_published_by from public.draft_episode_custom_moments where episode_id = p_episode_id;

  update public.episodes set status = 'completed', results_published_at = now(), results_published_by = p_published_by,
    guest_judge_name = v_override.guest_judge_name, judges_save_available = v_override.judges_save_available
  where id = p_episode_id;
  delete from public.draft_episode_overrides where episode_id = p_episode_id;
  delete from public.draft_dance_scores where episode_id = p_episode_id;
  delete from public.draft_episode_results where episode_id = p_episode_id;
  delete from public.draft_episode_custom_moments where episode_id = p_episode_id;
  delete from public.draft_episode_in_jeopardy_couples where episode_id = p_episode_id;
  delete from public.draft_couple_releases where episode_id = p_episode_id;
end;
$$;
create or replace function public.my_co_manager_invite_code(p_league_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select co_manager_invite_code from public.league_members
  where league_id = p_league_id and user_id = auth.uid() and co_manager_invite_expires_at > now();
$$;
revoke all on function public.my_co_manager_invite_code(uuid) from public, anon;
grant execute on function public.my_co_manager_invite_code(uuid) to authenticated;

create or replace function public.set_results_contributor(p_user_id uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_super_admin) then
    raise exception 'Only a site admin can manage results contributors';
  end if;
  update public.profiles set can_propose_results = p_enabled where id = p_user_id;
  if not found then raise exception 'Account not found'; end if;
end;
$$;
revoke all on function public.set_results_contributor(uuid, boolean) from public, anon;
grant execute on function public.set_results_contributor(uuid, boolean) to authenticated;

create or replace function public.validate_fantasy_settings_numbers()
returns trigger language plpgsql set search_path = '' as $$
declare pair record; n numeric;
begin
  for pair in select key, value from jsonb_each(to_jsonb(new))
    where key <> 'revision' and (jsonb_typeof(value) = 'number' or value::text in ('"NaN"', '"Infinity"', '"-Infinity"')) loop
    n := (pair.value #>> '{}')::numeric;
    if n::text in ('NaN', 'Infinity', '-Infinity') or abs(n) > 1000000 or scale(n) > 6 then
      raise exception 'Invalid numeric setting: %. Use a finite value up to 1,000,000 with at most six decimal places.', pair.key;
    end if;
    if pair.key like '%weight' and n < 0 then raise exception 'Category weights cannot be negative'; end if;
  end loop;
  if tg_table_name = 'leagues' then
    if new.pick_time_limit_seconds < 10 or new.pick_time_limit_seconds > 86400 then
      raise exception 'Pick time limit must be between 10 seconds and one day';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists validate_league_numbers on public.leagues;
drop trigger if exists a_validate_league_numbers on public.leagues;
create trigger a_validate_league_numbers before insert or update on public.leagues for each row execute function public.validate_fantasy_settings_numbers();
drop trigger if exists validate_scoring_numbers on public.scoring_settings;
drop trigger if exists a_validate_scoring_numbers on public.scoring_settings;
create trigger a_validate_scoring_numbers before insert or update on public.scoring_settings for each row execute function public.validate_fantasy_settings_numbers();

create or replace function public.save_episode_draft(p_input jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  ep public.episodes; actor public.profiles; entry jsonb; dance jsonb; js jsonb;
  couple uuid; draft_id uuid; live record; total numeric; count_scores int;
  token uuid; base timestamptz;
begin
  select * into strict actor from public.profiles where id = (p_input->>'updatedBy')::uuid;
  if not (actor.is_super_admin or actor.can_propose_results) then raise exception 'Not authorized to enter results'; end if;
  select * into strict ep from public.episodes where id = (p_input->>'episodeId')::uuid for update;
  select correction_token, correction_base_published_at into token, base from public.draft_episode_overrides where episode_id = ep.id;
  if ep.results_published_at is not null then
    if not actor.is_super_admin then raise exception 'Only a site admin can correct published results'; end if;
    if token is null or token is distinct from (p_input->>'correctionToken')::uuid or base is distinct from ep.results_published_at then
      raise exception 'This episode was published. Reload it to begin an explicit correction.';
    end if;
  elsif p_input->>'correctionToken' is not null then raise exception 'The correction session changed. Reload this episode.';
  end if;
  insert into public.draft_episode_overrides(episode_id, guest_judge_name, judges_save_available, updated_at, updated_by)
  values (ep.id, p_input->>'guestJudgeName', coalesce((p_input->>'judgesSaveAvailable')::boolean, false), now(), actor.id)
  on conflict (episode_id) do update set guest_judge_name = excluded.guest_judge_name, judges_save_available = excluded.judges_save_available, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  for entry in select * from jsonb_array_elements(p_input->'entries') loop
    couple := (entry->>'coupleId')::uuid;
    if not exists(select 1 from public.couples where id = couple and season_id = ep.season_id) then raise exception 'Couple is not in this season'; end if;
    delete from public.draft_dance_scores where episode_id = ep.id and couple_id = couple;
    if ep.results_published_at is null and exists(select 1 from public.dance_scores where episode_id = ep.id and couple_id = couple) then
      for live in select * from public.dance_scores where episode_id = ep.id and couple_id = couple loop
        insert into public.draft_dance_scores(episode_id,couple_id,dance_style_id,song_title,total_score,scaled_score)
        values(ep.id,couple,live.dance_style_id,live.song_title,live.total_score,live.scaled_score) returning id into draft_id;
        insert into public.draft_judge_scores(draft_dance_score_id,judge_id,score)
        select draft_id,judge_id,score from public.judge_scores where dance_score_id = live.id;
      end loop;
    else
      for dance in select * from jsonb_array_elements(entry->'dances') loop
        total := 0; count_scores := 0;
        for js in select * from jsonb_array_elements(dance->'judgeScores') loop
          if (js->>'score')::numeric not between 0 and 10 then raise exception 'Judge scores must be between 0 and 10'; end if;
          total := total + (js->>'score')::numeric; count_scores := count_scores + 1;
        end loop;
        insert into public.draft_dance_scores(episode_id,couple_id,dance_style_id,song_title,total_score,scaled_score)
        values(ep.id,couple,(dance->>'danceStyleId')::uuid,dance->>'songTitle',total,case when count_scores = 0 then 0 else total / count_scores * 3 end) returning id into draft_id;
        insert into public.draft_judge_scores(draft_dance_score_id,judge_id,score)
        select draft_id,(j->>'judgeId')::uuid,(j->>'score')::numeric from jsonb_array_elements(dance->'judgeScores') j;
      end loop;
    end if;
    insert into public.draft_episode_results(episode_id,couple_id,outcome,saved_by_judges,had_immunity,bonus_points,bonus_note)
    values(ep.id,couple,entry->>'outcome',coalesce((entry->>'savedByJudges')::boolean,false),coalesce((entry->>'hadImmunity')::boolean,false),coalesce((entry->>'bonusPoints')::numeric,0),entry->>'bonusNote')
    on conflict(episode_id,couple_id) do update set outcome=excluded.outcome,saved_by_judges=excluded.saved_by_judges,had_immunity=excluded.had_immunity,bonus_points=excluded.bonus_points,bonus_note=excluded.bonus_note;
    delete from public.draft_episode_in_jeopardy_couples where episode_id = ep.id and couple_id = couple;
    if entry->>'outcome' = 'safe' and (p_input->'inJeopardyCoupleIds') ? couple::text then
      insert into public.draft_episode_in_jeopardy_couples(episode_id,couple_id) values(ep.id,couple);
    end if;
  end loop;
end;
$$;
revoke all on function public.save_episode_draft(jsonb) from public, anon, authenticated;
grant execute on function public.save_episode_draft(jsonb) to service_role;

create or replace function public.seed_episode_correction(p_episode_id uuid, p_started_by uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare ep public.episodes; live record; draft_id uuid; token uuid;
begin
  if not exists(select 1 from public.profiles where id = p_started_by and is_super_admin) then raise exception 'Only a site admin can begin a correction'; end if;
  select * into strict ep from public.episodes where id = p_episode_id for update;
  if ep.results_published_at is null then raise exception 'Only published episodes can be corrected'; end if;
  select correction_token into token from public.draft_episode_overrides where episode_id = ep.id and correction_base_published_at = ep.results_published_at;
  if token is not null then return token; end if;
  delete from public.draft_episode_overrides where episode_id = ep.id;
  delete from public.draft_dance_scores where episode_id = ep.id;
  delete from public.draft_episode_results where episode_id = ep.id;
  delete from public.draft_episode_in_jeopardy_couples where episode_id = ep.id;
  delete from public.draft_episode_custom_moments where episode_id = ep.id;
  delete from public.draft_couple_releases where episode_id = ep.id;
  token := gen_random_uuid();
  insert into public.draft_episode_overrides(episode_id,guest_judge_name,judges_save_available,updated_by,correction_token,correction_base_published_at)
  values(ep.id,ep.guest_judge_name,ep.judges_save_available,p_started_by,token,ep.results_published_at);
  for live in select * from public.dance_scores where episode_id = ep.id loop
    insert into public.draft_dance_scores(episode_id,couple_id,dance_style_id,song_title,total_score,scaled_score)
    values(ep.id,live.couple_id,live.dance_style_id,live.song_title,live.total_score,live.scaled_score) returning id into draft_id;
    insert into public.draft_judge_scores(draft_dance_score_id,judge_id,score) select draft_id,judge_id,score from public.judge_scores where dance_score_id = live.id;
  end loop;
  insert into public.draft_episode_results(episode_id,couple_id,outcome,saved_by_judges,had_immunity,bonus_points,bonus_note)
  select episode_id,couple_id,outcome,saved_by_judges,had_immunity,bonus_points,bonus_note from public.episode_results where episode_id = ep.id;
  insert into public.draft_episode_in_jeopardy_couples(episode_id,couple_id) select episode_id,couple_id from public.episode_in_jeopardy_couples where episode_id = ep.id;
  insert into public.draft_episode_custom_moments(episode_id,couple_id,label) select episode_id,couple_id,label from public.episode_custom_moments where episode_id = ep.id;
  return token;
end;
$$;
revoke all on function public.seed_episode_correction(uuid,uuid) from public, anon, authenticated;
grant execute on function public.seed_episode_correction(uuid,uuid) to service_role;

alter table public.profiles enable row level security;
alter table public.seasons enable row level security;
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.scoring_settings enable row level security;
alter table public.dance_card_calibration enable row level security;
alter table public.people enable row level security;
alter table public.couples enable row level security;
alter table public.draft_picks enable row level security;
alter table public.draft_queues enable row level security;
alter table public.roster_slots enable row level security;
alter table public.waiver_claims enable row level security;
alter table public.competition_weeks enable row level security;
alter table public.episodes enable row level security;
alter table public.dance_styles enable row level security;
alter table public.round_types enable row level security;
alter table public.dance_scores enable row level security;
alter table public.judge_scores enable row level security;
alter table public.episode_results enable row level security;
alter table public.predictions enable row level security;
alter table public.grand_finale_predictions enable row level security;
alter table public.grand_finale_late_unlocks enable row level security;
alter table public.weekly_manager_scores enable row level security;
alter table public.draft_episode_overrides enable row level security;
alter table public.draft_dance_scores enable row level security;
alter table public.draft_judge_scores enable row level security;
alter table public.draft_couple_releases enable row level security;
alter table public.draft_episode_results enable row level security;
alter table public.draft_episode_in_jeopardy_couples enable row level security;
alter table public.draft_episode_custom_moments enable row level security;
alter table public.episode_custom_moments enable row level security;
alter table public.episode_participants enable row level security;
alter table public.episode_round_types enable row level security;
alter table public.episode_guest_judges enable row level security;
alter table public.episode_in_jeopardy_couples enable row level security;
alter table public.spoiler_watch_progress enable row level security;
create or replace function public.commit_episode_reveal(
  p_episode_id uuid,p_couple_id uuid,p_actor_id uuid,p_snapshot jsonb,p_plan jsonb,p_undo boolean
) returns void language plpgsql security invoker set search_path = '' set lock_timeout = '5s' as $$
declare ep public.episodes; dance record; live_id uuid;
begin
  -- Same lock order as final publication prevents an undo from crossing its commit.
  perform 1 from public.episodes where id=p_episode_id for update;
  lock table public.seasons, public.episodes, public.competition_weeks,
    public.couples, public.dance_scores, public.judge_scores,
    public.episode_results, public.episode_in_jeopardy_couples,
    public.leagues, public.scoring_settings, public.roster_slots,
    public.predictions, public.grand_finale_late_unlocks,
    public.grand_finale_predictions, public.draft_episode_overrides,
    public.draft_dance_scores, public.draft_judge_scores,
    public.draft_episode_results, public.draft_episode_in_jeopardy_couples,
    public.draft_episode_custom_moments, public.episode_participants,
    public.episode_custom_moments, public.draft_couple_releases,
    public.weekly_manager_scores in share row exclusive mode;
  if not exists(select 1 from public.profiles where id=p_actor_id and is_super_admin) then raise exception 'Not authorized to publish scores'; end if;
  select * into strict ep from public.episodes where id=p_episode_id;
  if ep.results_published_at is not null then raise exception 'This episode is already published'; end if;
  if p_snapshot->>'_revision' is null or p_snapshot->>'_revision' is distinct from public.episode_publication_snapshot(ep.id)->>'_revision' then
    raise exception 'Results or scoring inputs changed. Refresh and try again.';
  end if;
  if p_undo then
    delete from public.dance_scores where episode_id=ep.id and couple_id=p_couple_id;
  else
    if exists(select 1 from public.dance_scores where episode_id=ep.id and couple_id=p_couple_id) then raise exception 'This couple is already posted'; end if;
    if not exists(select 1 from public.draft_dance_scores where episode_id=ep.id and couple_id=p_couple_id) then raise exception 'No saved scores for this couple'; end if;
    for dance in select * from public.draft_dance_scores where episode_id=ep.id and couple_id=p_couple_id loop
      if not exists(select 1 from public.draft_judge_scores where draft_dance_score_id=dance.id) then raise exception 'Complete the judge scores before posting'; end if;
      insert into public.dance_scores(episode_id,couple_id,dance_style_id,song_title,total_score,scaled_score)
      select ep.id,p_couple_id,dance.dance_style_id,dance.song_title,sum(score),avg(score)*3
      from public.draft_judge_scores where draft_dance_score_id=dance.id returning id into live_id;
      insert into public.judge_scores(dance_score_id,judge_id,score)
      select live_id,judge_id,score from public.draft_judge_scores where draft_dance_score_id=dance.id;
    end loop;
  end if;
  if ep.week_id is not null then
    if exists(select 1 from jsonb_array_elements(p_plan->'weeklyScores') r where (r->>'week_id')::uuid is distinct from ep.week_id) then raise exception 'Invalid score week'; end if;
    delete from public.weekly_manager_scores where week_id=ep.week_id;
    insert into public.weekly_manager_scores(league_id,manager_id,week_id,roster_points,prediction_points,grand_finale_points,total_points)
    select league_id,manager_id,week_id,roster_points,prediction_points,grand_finale_points,total_points
    from jsonb_to_recordset(p_plan->'weeklyScores') as r(league_id uuid,manager_id uuid,week_id uuid,roster_points numeric,prediction_points numeric,grand_finale_points numeric,total_points numeric);
  end if;
end;
$$;
revoke all on function public.commit_episode_reveal(uuid,uuid,uuid,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.commit_episode_reveal(uuid,uuid,uuid,jsonb,jsonb,boolean) to service_role;

create or replace function public.replace_weekly_scores(p_episode_id uuid,p_revision text,p_rows jsonb)
returns void language plpgsql security invoker set search_path = '' set lock_timeout = '5s' as $$
declare ep public.episodes;
begin
  perform 1 from public.episodes where id=p_episode_id for update;
  lock table public.seasons, public.episodes, public.competition_weeks,
    public.couples, public.dance_scores, public.judge_scores,
    public.episode_results, public.episode_in_jeopardy_couples,
    public.leagues, public.scoring_settings, public.roster_slots,
    public.predictions, public.grand_finale_late_unlocks,
    public.grand_finale_predictions, public.draft_episode_overrides,
    public.draft_dance_scores, public.draft_judge_scores,
    public.draft_episode_results, public.draft_episode_in_jeopardy_couples,
    public.draft_episode_custom_moments, public.episode_participants,
    public.episode_custom_moments, public.draft_couple_releases,
    public.weekly_manager_scores in share row exclusive mode;
  select * into strict ep from public.episodes where id=p_episode_id;
  if p_revision is null or p_revision is distinct from public.episode_publication_snapshot(ep.id)->>'_revision' then raise exception 'Results or scoring inputs changed. Refresh and try again.'; end if;
  if ep.week_id is null then raise exception 'Episode has no competition week'; end if;
  if exists(select 1 from public.episodes where week_id=ep.week_id and results_published_at is null) then raise exception 'Wait until the whole week is published before recomputing'; end if;
  if exists(select 1 from jsonb_array_elements(p_rows) r where (r->>'week_id')::uuid is distinct from ep.week_id) then raise exception 'Invalid score week'; end if;
  delete from public.weekly_manager_scores where week_id=ep.week_id;
  insert into public.weekly_manager_scores(league_id,manager_id,week_id,roster_points,prediction_points,grand_finale_points,total_points)
  select league_id,manager_id,week_id,roster_points,prediction_points,grand_finale_points,total_points
  from jsonb_to_recordset(p_rows) as r(league_id uuid,manager_id uuid,week_id uuid,roster_points numeric,prediction_points numeric,grand_finale_points numeric,total_points numeric);
end;
$$;
revoke all on function public.replace_weekly_scores(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.replace_weekly_scores(uuid,text,jsonb) to service_role;

DO $$ declare t text; begin
  foreach t in array array['judge_scores','draft_judge_scores'] loop
    if not exists(select 1 from pg_catalog.pg_constraint where conname=t||'_score_range') then
      execute format('alter table public.%I add constraint %I check(score between 0 and 10) not valid',t,t||'_score_range');
    end if;
  end loop;
end $$;

create or replace function public.assert_episode_draft_actor(p_episode_id uuid,p_actor_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare ep public.episodes; actor public.profiles;
begin
  select * into strict actor from public.profiles where id=p_actor_id;
  if not (actor.is_super_admin or actor.can_propose_results) then raise exception 'Not authorized to enter results'; end if;
  select * into strict ep from public.episodes where id=p_episode_id for update;
  if ep.results_published_at is not null then
    if not actor.is_super_admin then raise exception 'Only a site admin can correct published results'; end if;
    if not exists(select 1 from public.draft_episode_overrides where episode_id=ep.id and correction_token is not null and correction_base_published_at=ep.results_published_at) then raise exception 'Reload this episode to begin a correction'; end if;
  end if;
end;
$$;
revoke all on function public.assert_episode_draft_actor(uuid,uuid) from public,anon,authenticated;
grant execute on function public.assert_episode_draft_actor(uuid,uuid) to service_role;

create or replace function public.mutate_draft_moment(p_episode_id uuid,p_actor_id uuid,p_moment_id uuid,p_couple_id uuid,p_label text,p_remove boolean)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare result uuid;
begin
  perform public.assert_episode_draft_actor(p_episode_id,p_actor_id);
  if p_remove then
    delete from public.draft_episode_custom_moments where id=p_moment_id and episode_id=p_episode_id returning id into result;
    if result is null then raise exception 'That event is no longer in this episode'; end if;
  else
    if p_label is null or length(btrim(p_label))=0 then raise exception 'Event label is required'; end if;
    if p_couple_id is not null and not exists(select 1 from public.couples c join public.episodes e on e.season_id=c.season_id where c.id=p_couple_id and e.id=p_episode_id) then raise exception 'Couple is not in this season'; end if;
    insert into public.draft_episode_custom_moments(episode_id,couple_id,label,created_by) values(p_episode_id,p_couple_id,btrim(p_label),p_actor_id) returning id into result;
  end if;
  insert into public.draft_episode_overrides(episode_id,updated_by,guest_judge_name,judges_save_available)
  select id,p_actor_id,guest_judge_name,judges_save_available from public.episodes where id=p_episode_id
  on conflict(episode_id) do update set updated_at=now(),updated_by=p_actor_id;
  return result;
end;
$$;
revoke all on function public.mutate_draft_moment(uuid,uuid,uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.mutate_draft_moment(uuid,uuid,uuid,uuid,text,boolean) to service_role;

create or replace function public.set_draft_couple_release(p_episode_id uuid,p_couple_id uuid,p_actor_id uuid,p_release boolean)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform public.assert_episode_draft_actor(p_episode_id,p_actor_id);
  if exists(select 1 from public.episodes where id=p_episode_id and results_published_at is not null) then raise exception 'This episode is already published'; end if;
  if p_release then
    if exists(select 1 from public.dance_scores where episode_id=p_episode_id and couple_id=p_couple_id) then raise exception 'This couple is already live'; end if;
    if not exists(select 1 from public.draft_dance_scores where episode_id=p_episode_id and couple_id=p_couple_id)
      or exists(select 1 from public.draft_dance_scores d where d.episode_id=p_episode_id and d.couple_id=p_couple_id and not exists(select 1 from public.draft_judge_scores where draft_dance_score_id=d.id)) then raise exception 'Complete the saved judge scores before releasing'; end if;
    insert into public.draft_couple_releases(episode_id,couple_id,released_by) values(p_episode_id,p_couple_id,p_actor_id)
    on conflict(episode_id,couple_id) do update set released_at=now(),released_by=p_actor_id;
  else delete from public.draft_couple_releases where episode_id=p_episode_id and couple_id=p_couple_id;
  end if;
end;
$$;
revoke all on function public.set_draft_couple_release(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_draft_couple_release(uuid,uuid,uuid,boolean) to service_role;

commit;
