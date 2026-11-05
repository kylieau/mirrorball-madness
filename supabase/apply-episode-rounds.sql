-- Planned dance rounds per episode (Edit Episode → Dance Rounds For This
-- Episode), exceptions (Immune, Not Dancing, Withdrawn), and heats judged
-- couple by couple.
--
-- 1. episode_rounds and episode_round_exceptions; episode_teams gains
--    round_id and heat_number, so special dances become a round's heats or
--    teams; episode_team_couple_marks holds a heat's marks per couple.
-- 2. A special dance can be scored 'couple_marks' (each couple's own marks,
--    out of the night's judges × 10) besides shared 'marks' and 'points'.
--    special_dance_status / special_dance_blocker, materialize_team_scores,
--    visible_draft_special_scores, save_special_dance, the publication
--    snapshot and the three commit RPCs' locks learn it (the commits are the
--    live definitions of 2026-11-05 with one more table locked). A plan
--    without planVersion 3 is refused only when the episode has such a dance.
-- 3. New service-only RPCs: save_episode_rounds (site admin, the whole plan),
--    save_round_exception, set_round_bonus and save_team_couple_marks
--    (propose tier, Enter Results). An immune couple's bonus is a one-couple
--    Points row in the round's immunity dance, following the round's winner's
--    bonus unless overridden.
-- 4. Backfill: every episode gets Round 1 plus its extra dances and one round
--    per special Dance Type. E09 becomes Round 1 + Team Dance (2 teams); E10
--    becomes Round 1 + Dance-Off (3 heats, now scored by the winner's bonus,
--    "Dance-Off" renamed "Dance-Off 1"); an Immunity special entered by hand
--    becomes that round's immunity bonus. No score or posted row changes.
--
-- Additive: the app already deployed keeps working against it, so apply
-- this before deploying the app that plans rounds. Runs after
-- apply-retire-special-leftovers.sql. Safe to rerun.
begin;

-- A planned round of one episode. Round 1 is always the couples' own
-- Individual Dance. 'own' rounds are one more dance per couple (the draft
-- rows map to them by order, as expected_dance_count did); 'special' rounds
-- hold heats or teams as episode_teams rows; 'none' rounds only decide an
-- elimination and never score.
create table if not exists public.episode_rounds (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.episodes(id) on delete cascade,
  position int not null check (position between 1 and 12),
  kind text not null check (kind in ('own', 'special', 'none')),
  round_type text not null check (length(btrim(round_type)) between 1 and 40),
  scoring text not null,
  -- A fixed-bonus round's winner's points, null until the show says.
  bonus_points numeric check (bonus_points is null or (bonus_points between -100 and 100 and bonus_points * 2 = trunc(bonus_points * 2))),
  -- Heats or teams in a special round.
  unit_count int not null default 0 check (unit_count between 0 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint episode_rounds_position_key unique (episode_id, position) deferrable initially immediate,
  constraint episode_rounds_id_episode_key unique (id, episode_id),
  constraint episode_rounds_kind_scoring check (
    (kind = 'own' and scoring = 'marks' and unit_count = 0 and bonus_points is null)
    or (kind = 'special' and scoring in ('couple_marks', 'fixed_bonus', 'ranked_points', 'team_marks') and unit_count >= 1
        and (bonus_points is null or scoring = 'fixed_bonus'))
    or (kind = 'none' and scoring = 'none' and unit_count = 0 and bonus_points is null)
  )
);

-- A couple who is not in a round: Immune, Not Dancing or Withdrawn. Notes are
-- for the people entering results, so no client role can read these.
create table if not exists public.episode_round_exceptions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null,
  episode_id uuid not null,
  couple_id uuid not null references public.couples(id) on delete cascade,
  kind text not null check (kind in ('immune', 'not_dancing', 'withdrawn')),
  note text check (note is null or length(note) <= 200),
  -- An immune couple's own bonus; null takes the round's bonus.
  bonus_points numeric check (bonus_points is null or (bonus_points between -100 and 100 and bonus_points * 2 = trunc(bonus_points * 2))),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (round_id, episode_id) references public.episode_rounds(id, episode_id) on delete cascade,
  unique (round_id, couple_id),
  check (bonus_points is null or kind = 'immune')
);
create index if not exists idx_episode_round_exceptions_episode on public.episode_round_exceptions(episode_id);

-- A special dance's place in the plan: its round and heat (or team) number.
-- A round's immunity bonus is the one row with a round and no heat.
alter table public.episode_teams
  add column if not exists round_id uuid references public.episode_rounds(id) on delete set null,
  add column if not exists heat_number int check (heat_number between 1 and 12);
create unique index if not exists uq_episode_teams_round_heat on public.episode_teams(round_id, heat_number)
  where round_id is not null and heat_number is not null;
create unique index if not exists uq_episode_teams_round_immunity on public.episode_teams(round_id)
  where round_id is not null and heat_number is null;

-- Judges' marks for each couple of a heat, when a heat is judged couple by
-- couple instead of as one shared score.
create table if not exists public.episode_team_couple_marks (
  team_id uuid not null references public.episode_teams(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  judge_id uuid not null references public.people(id),
  score numeric not null constraint episode_team_couple_marks_whole_mark check (score between 1 and 10 and score = trunc(score)),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  primary key (team_id, couple_id, judge_id)
);

alter table public.episode_teams drop constraint if exists episode_teams_special_checks;
alter table public.episode_teams add constraint episode_teams_special_checks check (
  scoring_mode in ('marks', 'points', 'couple_marks')
  and length(btrim(dance_type)) between 1 and 40
  and jsonb_typeof(songs) = 'array' and jsonb_array_length(songs) <= 4
  and jsonb_typeof(details) = 'array' and jsonb_array_length(details) <= 12
);

alter table public.episode_rounds enable row level security;
alter table public.episode_round_exceptions enable row level security;
alter table public.episode_team_couple_marks enable row level security;
revoke all on public.episode_rounds, public.episode_round_exceptions, public.episode_team_couple_marks from anon, authenticated;
grant select on public.episode_rounds to authenticated;
grant all on public.episode_rounds, public.episode_round_exceptions, public.episode_team_couple_marks to service_role;
drop policy if exists "episode rounds are viewable by authenticated users" on public.episode_rounds;
create policy "episode rounds are viewable by authenticated users" on public.episode_rounds for select to authenticated using (true);

CREATE OR REPLACE FUNCTION public.special_dance_status(p_team_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare team public.episode_teams; v_panel uuid[]; v_done int; v_total int; v_complete boolean;
begin
  select * into team from public.episode_teams where id = p_team_id;
  if team.id is null then return null; end if;
  if team.scoring_mode = 'points' then
    select count(*), count(*) filter (where exists (select 1 from public.episode_team_scores s where s.team_id = team.id and s.couple_id = m and s.points is not null))
      into v_total, v_done from public.team_eligible_members(team.episode_id, team.id) m;
    v_complete := v_total > 0 and v_done = v_total;
  elsif team.scoring_mode = 'couple_marks' then
    v_panel := public.special_dance_panel(team.id);
    select count(distinct m.couple_id) * cardinality(v_panel), count(k.judge_id) into v_total, v_done
    from public.team_eligible_members(team.episode_id, team.id) as m(couple_id)
    left join public.episode_team_couple_marks k on k.team_id = team.id and k.couple_id = m.couple_id and k.judge_id = any(v_panel);
    v_complete := cardinality(v_panel) between 2 and 4 and v_total > 0 and v_done = v_total;
  else
    v_panel := public.special_dance_panel(team.id);
    v_total := cardinality(v_panel);
    select count(*) into v_done from public.episode_team_marks k where k.team_id = team.id and k.judge_id = any(v_panel);
    v_complete := v_total between 2 and 4 and v_done = v_total;
  end if;
  return jsonb_build_object('mode', team.scoring_mode, 'done', v_done, 'total', v_total, 'complete', v_complete,
    'judges', coalesce(cardinality(v_panel), 0), 'label', public.special_dance_label(team));
end;
$function$;

CREATE OR REPLACE FUNCTION public.special_dance_blocker(p_team_id uuid, p_when text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare s jsonb;
begin
  s := public.special_dance_status(p_team_id);
  if s is null or (s->>'complete')::boolean then return null; end if;
  if s->>'mode' = 'points' then
    return format('%s has points for %s of %s couples. Enter every couple''s points or remove it %s.', s->>'label', s->>'done', s->>'total', p_when);
  elsif not ((s->>'judges')::int between 2 and 4) then
    return format('%s needs 2 to 4 judges and has %s. Fix its panel %s.', s->>'label', s->>'judges', p_when);
  end if;
  return format('%s has %s of %s marks. Score it or remove it %s.', s->>'label', s->>'done', s->>'total', p_when);
end;
$function$;

CREATE OR REPLACE FUNCTION public.materialize_team_scores(p_episode_id uuid, p_team_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  team public.episode_teams; v_blocker text; v_panel uuid[]; v_total numeric; v_max numeric;
  v_member uuid; v_live_id uuid;
begin
  select * into strict team from public.episode_teams where id = p_team_id and episode_id = p_episode_id;
  v_blocker := public.special_dance_blocker(team.id, 'first');
  if v_blocker is not null then raise exception '%', v_blocker; end if;
  if team.scoring_mode = 'points' then
    for v_member in select * from public.team_eligible_members(p_episode_id, team.id) loop
      insert into public.dance_scores (episode_id, couple_id, dance_style_id, song_title, total_score, scaled_score, max_score, team_id)
      select p_episode_id, v_member, team.dance_style_id, team.song_title, s.points, 0, 0, team.id
      from public.episode_team_scores s where s.team_id = team.id and s.couple_id = v_member
      on conflict (team_id, couple_id) where team_id is not null do update
        set dance_style_id = excluded.dance_style_id, song_title = excluded.song_title,
            total_score = excluded.total_score, scaled_score = excluded.scaled_score, max_score = excluded.max_score
      returning id into v_live_id;
      delete from public.judge_scores where dance_score_id = v_live_id;
    end loop;
  elsif team.scoring_mode = 'couple_marks' then
    v_panel := public.special_dance_panel(team.id);
    v_max := cardinality(v_panel) * 10;
    for v_member in select * from public.team_eligible_members(p_episode_id, team.id) loop
      select coalesce(sum(score), 0) into v_total from public.episode_team_couple_marks
      where team_id = team.id and couple_id = v_member and judge_id = any(v_panel);
      insert into public.dance_scores (episode_id, couple_id, dance_style_id, song_title, total_score, scaled_score, max_score, team_id)
      values (p_episode_id, v_member, team.dance_style_id, team.song_title, v_total, v_total * 30 / v_max, v_max, team.id)
      on conflict (team_id, couple_id) where team_id is not null do update
        set dance_style_id = excluded.dance_style_id, song_title = excluded.song_title,
            total_score = excluded.total_score, scaled_score = excluded.scaled_score, max_score = excluded.max_score
      returning id into v_live_id;
      delete from public.judge_scores where dance_score_id = v_live_id;
      insert into public.judge_scores (dance_score_id, judge_id, score)
      select v_live_id, judge_id, score from public.episode_team_couple_marks
      where team_id = team.id and couple_id = v_member and judge_id = any(v_panel);
    end loop;
  else
    v_panel := public.special_dance_panel(team.id);
    select coalesce(sum(score), 0) into v_total from public.episode_team_marks where team_id = team.id and judge_id = any(v_panel);
    v_max := cardinality(v_panel) * 10;
    for v_member in select * from public.team_eligible_members(p_episode_id, team.id) loop
      insert into public.dance_scores (episode_id, couple_id, dance_style_id, song_title, total_score, scaled_score, max_score, team_id)
      values (p_episode_id, v_member, team.dance_style_id, team.song_title, v_total, v_total * 30 / v_max, v_max, team.id)
      on conflict (team_id, couple_id) where team_id is not null do update
        set dance_style_id = excluded.dance_style_id, song_title = excluded.song_title,
            total_score = excluded.total_score, scaled_score = excluded.scaled_score, max_score = excluded.max_score
      returning id into v_live_id;
      delete from public.judge_scores where dance_score_id = v_live_id;
      insert into public.judge_scores (dance_score_id, judge_id, score)
      select v_live_id, judge_id, score from public.episode_team_marks where team_id = team.id and judge_id = any(v_panel);
    end loop;
  end if;
  delete from public.dance_scores d where d.team_id = team.id
    and not exists (select 1 from public.team_eligible_members(p_episode_id, team.id) m where m = d.couple_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.visible_draft_special_scores()
 RETURNS TABLE(episode_id uuid, week_id uuid, week_number integer, team_id uuid, couple_id uuid, dance_style_name text, total_score numeric, scaled_score numeric, max_score numeric, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  ),
  couple_marks as (
    select r.id as team_id, k.couple_id, sum(k.score) as total, cardinality(public.special_dance_panel(r.id)) * 10 as max_score
    from released r
    join public.episode_team_couple_marks k on k.team_id = r.id and k.judge_id = any(public.special_dance_panel(r.id))
    where r.scoring_mode = 'couple_marks'
    group by r.id, k.couple_id
  )
  select r.episode_id, r.week_id, r.week_number, r.id, m.couple_id, r.style_name,
    case r.scoring_mode when 'points' then sc.points when 'couple_marks' then cm.total else k.total end,
    case r.scoring_mode when 'points' then 0 when 'couple_marks' then cm.total * 30 / cm.max_score else k.total * 30 / k.max_score end,
    case r.scoring_mode when 'points' then 0 when 'couple_marks' then cm.max_score else k.max_score end,
    r.released_at
  from released r
  cross join lateral public.team_eligible_members(r.episode_id, r.id) as m(couple_id)
  left join marks k on k.team_id = r.id
  left join public.episode_team_scores sc on sc.team_id = r.id and sc.couple_id = m.couple_id
  left join couple_marks cm on cm.team_id = r.id and cm.couple_id = m.couple_id;
$function$;

CREATE OR REPLACE FUNCTION public.save_special_dance(p_episode_id uuid, p_actor_id uuid, p_dance jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  ep public.episodes; existing public.episode_teams; v_freestyle uuid;
  v_id uuid; v_type text; v_name text; v_auto boolean := false; v_members uuid[]; v_old_members uuid[];
  v_style uuid; v_second uuid; v_songs jsonb; v_song_title text; v_mode text; v_round public.episode_rounds; v_round_id uuid; v_heat int;
  v_details jsonb; v_captain uuid; v_host text; v_sort int; v_scored boolean;
  song jsonb; detail jsonb; n int; v_candidate text; actor public.profiles;
begin
  select * into actor from public.profiles where id = p_actor_id;
  if not coalesce(actor.is_super_admin or actor.can_propose_results, false) then raise exception 'Not authorized to enter results'; end if;
  select * into strict ep from public.episodes where id = p_episode_id for update;
  -- Checked under the episode lock, so a save racing a publish sees it.
  if not actor.is_super_admin and ep.results_published_at is not null then
    raise exception 'Only a site admin can change special dances on a published week';
  end if;
  if p_dance is null or jsonb_typeof(p_dance) <> 'object' then raise exception 'A special dance must be an object'; end if;
  if nullif(p_dance->>'id', '') is not null then
    select * into existing from public.episode_teams where id = (p_dance->>'id')::uuid and episode_id = ep.id for update;
    if existing.id is null then raise exception 'That special dance is no longer on this episode. Reload and try again.'; end if;
    -- A posted dance's style and song rewrite its live rows, which only a
    -- site admin may change.
    if existing.posted_at is not null and not actor.is_super_admin then
      raise exception 'Only a site admin can change % once it is posted', public.special_dance_label(existing);
    end if;
  end if;
  select id into v_freestyle from public.dance_styles where lower(name) = 'freestyle' order by created_at limit 1;

  v_type := btrim(coalesce(p_dance->>'danceType', existing.dance_type, 'Team Dance'));
  if length(v_type) not between 1 and 40 then raise exception 'Dance Type must be 1 to 40 characters'; end if;

  if p_dance ? 'memberCoupleIds' then
    if jsonb_typeof(p_dance->'memberCoupleIds') <> 'array' then raise exception 'Participants must be a list'; end if;
    select coalesce(array_agg(d.id order by d.ord), '{}'::uuid[]) into v_members from (
      select (e.x #>> '{}')::uuid as id, min(e.ord) as ord
      from jsonb_array_elements(p_dance->'memberCoupleIds') with ordinality as e(x, ord) group by 1
    ) d;
  elsif existing.id is not null then
    select coalesce(array_agg(couple_id order by sort_order, couple_id), '{}'::uuid[]) into v_members from public.episode_team_members where team_id = existing.id;
  else
    v_members := '{}'::uuid[];
  end if;
  if cardinality(v_members) < 1 then raise exception 'A special dance needs at least one participant'; end if;
  if exists (select 1 from unnest(v_members) m(id) where not exists (select 1 from public.couples c where c.id = m.id and c.season_id = ep.season_id)) then
    raise exception 'A participant is not in this season';
  end if;

  v_style := coalesce(nullif(p_dance->>'danceStyleId', '')::uuid, existing.dance_style_id, v_freestyle);
  if v_style is null or not exists (select 1 from public.dance_styles where id = v_style) then raise exception 'Pick a dance style'; end if;
  if p_dance ? 'secondDanceStyleId' then v_second := nullif(p_dance->>'secondDanceStyleId', '')::uuid; else v_second := existing.second_dance_style_id; end if;
  if v_second is not null and not exists (select 1 from public.dance_styles where id = v_second) then raise exception 'Pick a second dance style that exists'; end if;

  if p_dance ? 'songs' then
    if jsonb_typeof(p_dance->'songs') <> 'array' then raise exception 'Songs must be a list'; end if;
    v_songs := '[]'::jsonb;
    for song in select * from jsonb_array_elements(p_dance->'songs') loop
      continue when jsonb_typeof(song) <> 'object' or nullif(btrim(coalesce(song->>'title', '')), '') is null;
      v_songs := v_songs || jsonb_build_object('title', btrim(song->>'title'));
    end loop;
  else
    v_songs := coalesce(existing.songs, '[]'::jsonb);
    if p_dance ? 'songTitle' then
      v_song_title := nullif(btrim(coalesce(p_dance->>'songTitle', '')), '');
      if v_song_title is null then
        if jsonb_array_length(v_songs) > 0 then v_songs := v_songs - 0; end if;
      elsif jsonb_array_length(v_songs) = 0 then
        v_songs := jsonb_build_array(jsonb_build_object('title', v_song_title));
      else
        v_songs := jsonb_set(v_songs, '{0,title}', to_jsonb(v_song_title));
      end if;
    end if;
  end if;
  if jsonb_array_length(v_songs) > 4 then raise exception 'A special dance can list up to 4 songs'; end if;
  v_song_title := v_songs #>> '{0,title}';

  v_mode := coalesce(nullif(p_dance->>'scoringMode', ''), existing.scoring_mode, 'marks');
  if v_mode not in ('marks', 'points', 'couple_marks') then raise exception 'Scoring must be judges'' marks or points'; end if;

  if p_dance ? 'details' then
    if jsonb_typeof(p_dance->'details') <> 'array' then raise exception 'Details must be a list'; end if;
    v_details := '[]'::jsonb;
    for detail in select * from jsonb_array_elements(p_dance->'details') loop
      continue when jsonb_typeof(detail) <> 'object';
      if nullif(btrim(coalesce(detail->>'label', '')), '') is null then raise exception 'Every extra detail needs a label'; end if;
      v_details := v_details || jsonb_strip_nulls(jsonb_build_object(
        'label', btrim(detail->>'label'), 'value', btrim(coalesce(detail->>'value', '')), 'coupleId', nullif(detail->>'coupleId', '')::uuid));
    end loop;
  else
    v_details := coalesce(existing.details, '[]'::jsonb);
    if p_dance ? 'captainCoupleId' then
      select coalesce(jsonb_agg(e.d order by e.ord), '[]'::jsonb) into v_details
      from jsonb_array_elements(v_details) with ordinality as e(d, ord) where lower(e.d->>'label') <> 'captain';
      if nullif(p_dance->>'captainCoupleId', '') is not null then
        v_details := v_details || jsonb_build_object('label', 'Captain', 'coupleId', (p_dance->>'captainCoupleId')::uuid,
          'value', coalesce((select p.name from public.couples c join public.people p on p.id = c.celebrity_id where c.id = (p_dance->>'captainCoupleId')::uuid), ''));
      end if;
    end if;
    if p_dance ? 'hostName' then
      select coalesce(jsonb_agg(e.d order by e.ord), '[]'::jsonb) into v_details
      from jsonb_array_elements(v_details) with ordinality as e(d, ord) where lower(e.d->>'label') <> 'host';
      if nullif(btrim(coalesce(p_dance->>'hostName', '')), '') is not null then
        v_details := v_details || jsonb_build_object('label', 'Host', 'value', btrim(p_dance->>'hostName'));
      end if;
    end if;
  end if;
  if jsonb_array_length(v_details) > 12 then raise exception 'A special dance can carry up to 12 extra details'; end if;
  for detail in select * from jsonb_array_elements(v_details) loop
    continue when detail->>'coupleId' is null;
    if not exists (select 1 from public.couples c where c.id = (detail->>'coupleId')::uuid and c.season_id = ep.season_id) then
      raise exception 'Detail "%" names a couple who is not in this season', detail->>'label';
    end if;
    if lower(detail->>'label') = 'captain' and not ((detail->>'coupleId')::uuid = any(v_members)) then
      raise exception 'The captain must be on the team';
    end if;
  end loop;
  select (d->>'coupleId')::uuid into v_captain from jsonb_array_elements(v_details) d where lower(d->>'label') = 'captain' and d->>'coupleId' is not null limit 1;
  select nullif(btrim(d->>'value'), '') into v_host from jsonb_array_elements(v_details) d where lower(d->>'label') = 'host' limit 1;

  v_name := btrim(coalesce(p_dance->>'name', case when existing.name_is_auto then '' else existing.name end, ''));
  if v_name = '' then
    v_auto := true;
    n := 1;
    loop
      v_candidate := case when n = 1 then v_type else v_type || ' ' || n end;
      exit when not exists (select 1 from public.episode_teams t where t.episode_id = ep.id and lower(t.name) = lower(v_candidate) and t.id is distinct from existing.id);
      n := n + 1;
    end loop;
    v_name := v_candidate;
  elsif exists (select 1 from public.episode_teams t where t.episode_id = ep.id and lower(t.name) = lower(v_name) and t.id is distinct from existing.id) then
    raise exception 'Another special dance is already called "%"', v_name;
  end if;

  v_sort := coalesce(nullif(p_dance->>'sortOrder', '')::int, existing.sort_order,
    (select coalesce(max(sort_order), 0) + 1 from public.episode_teams where episode_id = ep.id));

  if p_dance ? 'roundId' then
    if nullif(p_dance->>'roundId', '') is not null then
      select * into v_round from public.episode_rounds where id = (p_dance->>'roundId')::uuid and episode_id = ep.id;
      if v_round.id is null then raise exception 'That round is no longer on this episode. Reload and try again.'; end if;
      if v_round.kind <> 'special' then raise exception 'Only a special round has heats'; end if;
      v_round_id := v_round.id;
      v_heat := nullif(p_dance->>'heatNumber', '')::int;
      if v_heat is not null and exists (select 1 from public.episode_teams t where t.round_id = v_round_id and t.heat_number = v_heat and t.id is distinct from existing.id) then
        raise exception '% % is already set up. Reload and try again.', v_round.round_type, v_heat;
      end if;
    end if;
  else
    v_round_id := existing.round_id;
    v_heat := existing.heat_number;
  end if;

  if existing.id is not null then
    select coalesce(array_agg(couple_id order by couple_id), '{}'::uuid[]) into v_old_members from public.episode_team_members where team_id = existing.id;
    if existing.posted_at is not null
       and (select coalesce(array_agg(m order by m), '{}'::uuid[]) from unnest(v_members) m) is distinct from v_old_members then
      raise exception 'Un-post % before changing its participants', public.special_dance_label(existing);
    end if;
    if v_mode is distinct from existing.scoring_mode then
      if existing.posted_at is not null then raise exception 'Un-post % before changing how it is scored', public.special_dance_label(existing); end if;
      v_scored := exists (select 1 from public.episode_team_marks where team_id = existing.id)
        or exists (select 1 from public.episode_team_couple_marks where team_id = existing.id)
        or exists (select 1 from public.episode_team_scores where team_id = existing.id and points is not null);
      if v_scored then raise exception 'Clear the saved scores of % before changing how it is scored', public.special_dance_label(existing); end if;
    end if;
  end if;

  if existing.id is null then
    insert into public.episode_teams (episode_id, name, name_is_auto, dance_type, song_title, dance_style_id, second_dance_style_id,
      songs, scoring_mode, details, captain_couple_id, host_name, sort_order, round_id, heat_number)
    values (ep.id, v_name, v_auto, v_type, v_song_title, v_style, v_second,
      v_songs, v_mode, v_details, v_captain, v_host, v_sort, v_round_id, v_heat)
    returning id into v_id;
  else
    v_id := existing.id;
    update public.episode_teams set name = v_name, name_is_auto = v_auto, dance_type = v_type, song_title = v_song_title,
      dance_style_id = v_style, second_dance_style_id = v_second, songs = v_songs, scoring_mode = v_mode,
      details = v_details, captain_couple_id = v_captain, host_name = v_host, sort_order = v_sort,
      round_id = v_round_id, heat_number = v_heat, updated_at = now()
    where id = existing.id;
    update public.dance_scores set dance_style_id = v_style, song_title = v_song_title
    where team_id = existing.id and (dance_style_id, song_title) is distinct from (v_style, v_song_title);
    delete from public.episode_team_members where team_id = existing.id and not (couple_id = any(v_members));
    delete from public.episode_team_scores where team_id = existing.id and (v_mode <> 'points' or not (couple_id = any(v_members)));
    if v_mode <> 'marks' then delete from public.episode_team_marks where team_id = existing.id; end if;
    delete from public.episode_team_couple_marks where team_id = existing.id and (v_mode <> 'couple_marks' or not (couple_id = any(v_members)));
  end if;
  insert into public.episode_team_members (team_id, episode_id, couple_id, sort_order)
  select v_id, ep.id, e.m, e.ord from unnest(v_members) with ordinality as e(m, ord)
  on conflict (team_id, couple_id) do update set sort_order = excluded.sort_order;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.assert_special_dance_plan(p_episode_id uuid, p_plan jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if coalesce(nullif(p_plan->>'planVersion', '')::int, 0) < 2
     and exists (select 1 from public.episode_teams where episode_id = p_episode_id and scoring_mode = 'points') then
    raise exception 'This episode has a special dance scored in points, which this version of the app cannot score. Reload the page and try again.';
  end if;
  if coalesce(nullif(p_plan->>'planVersion', '')::int, 0) < 3
     and exists (select 1 from public.episode_teams where episode_id = p_episode_id and scoring_mode = 'couple_marks') then
    raise exception 'This episode has a special dance scored by each couple''s marks, which this version of the app cannot score. Reload the page and try again.';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.episode_publication_snapshot(p_episode_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
    'participants', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.episode_participants where episode_id = p_episode_id) r),
    'teams', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.episode_teams where episode_id = p_episode_id) r),
    'teamMembers', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.episode_team_members where episode_id = p_episode_id) r),
    'teamMarks', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.episode_team_marks where team_id in (select id from public.episode_teams where episode_id = p_episode_id)) r),
    'teamCoupleMarks', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.episode_team_couple_marks where team_id in (select id from public.episode_teams where episode_id = p_episode_id)) r),
    'teamScores', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.episode_team_scores where team_id in (select id from public.episode_teams where episode_id = p_episode_id)) r),
    'judges', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id) order by p.id), '[]'::jsonb) from public.people p where p.role = 'judge' and p.archived_at is null),
    'guestJudges', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select episode_id, judge_id from public.episode_guest_judges where episode_id = p_episode_id) r)
  ) as payload) snapshot;
$function$;

CREATE OR REPLACE FUNCTION public.commit_episode_reveal(p_episode_id uuid, p_couple_id uuid, p_actor_id uuid, p_snapshot jsonb, p_plan jsonb, p_undo boolean)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
 SET lock_timeout TO '5s'
AS $function$
declare ep public.episodes; dance record; live_id uuid;
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
    public.episode_participants, public.draft_couple_releases,
    public.weekly_manager_scores, public.episode_teams, public.episode_team_members,
    public.episode_team_marks, public.episode_team_scores, public.episode_team_couple_marks in share row exclusive mode;
  if not exists(select 1 from public.profiles where id=p_actor_id and is_super_admin) then raise exception 'Not authorized to publish scores'; end if;
  select * into strict ep from public.episodes where id=p_episode_id;
  if ep.results_published_at is not null then raise exception 'This episode is already published'; end if;
  perform public.assert_special_dance_plan(ep.id, p_plan);
  if p_snapshot->>'_revision' is null or p_snapshot->>'_revision' is distinct from public.episode_publication_snapshot(ep.id)->>'_revision' then
    raise exception 'Results or scoring inputs changed. Refresh and try again.';
  end if;
  if p_undo then
    delete from public.dance_scores where episode_id=ep.id and couple_id=p_couple_id and team_id is null;
  else
    if exists(select 1 from public.dance_scores where episode_id=ep.id and couple_id=p_couple_id and team_id is null) then raise exception 'This couple is already posted'; end if;
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
$function$;

CREATE OR REPLACE FUNCTION public.commit_team_reveal(p_episode_id uuid, p_team_id uuid, p_actor_id uuid, p_snapshot jsonb, p_plan jsonb, p_undo boolean)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
 SET lock_timeout TO '5s'
AS $function$
declare ep public.episodes;
begin
  perform 1 from public.episodes where id = p_episode_id for update;
  lock table public.seasons, public.episodes, public.competition_weeks,
    public.couples, public.dance_scores, public.judge_scores,
    public.episode_results, public.episode_in_jeopardy_couples,
    public.leagues, public.scoring_settings, public.roster_slots,
    public.predictions, public.grand_finale_late_unlocks,
    public.grand_finale_predictions, public.draft_episode_overrides,
    public.draft_dance_scores, public.draft_judge_scores,
    public.draft_episode_results, public.draft_episode_in_jeopardy_couples,
    public.episode_participants, public.draft_couple_releases,
    public.weekly_manager_scores, public.episode_teams, public.episode_team_members,
    public.episode_team_marks, public.episode_team_scores, public.episode_team_couple_marks in share row exclusive mode;
  if not exists (select 1 from public.profiles where id = p_actor_id and is_super_admin) then raise exception 'Not authorized to publish scores'; end if;
  select * into strict ep from public.episodes where id = p_episode_id;
  if ep.results_published_at is not null then raise exception 'This episode is already published'; end if;
  perform public.assert_special_dance_plan(ep.id, p_plan);
  if p_snapshot->>'_revision' is null or p_snapshot->>'_revision' is distinct from public.episode_publication_snapshot(ep.id)->>'_revision' then
    raise exception 'Results or scoring inputs changed. Refresh and try again.';
  end if;
  if not exists (select 1 from public.episode_teams where id = p_team_id and episode_id = ep.id) then raise exception 'That special dance is no longer on this episode'; end if;
  if p_undo then
    delete from public.dance_scores where team_id = p_team_id;
    update public.episode_teams set posted_at = null, posted_by = null where id = p_team_id;
  else
    perform public.materialize_team_scores(ep.id, p_team_id);
    update public.episode_teams set posted_at = now(), posted_by = p_actor_id where id = p_team_id;
  end if;
  if ep.week_id is not null then
    if exists (select 1 from jsonb_array_elements(p_plan->'weeklyScores') r where (r->>'week_id')::uuid is distinct from ep.week_id) then raise exception 'Invalid score week'; end if;
    delete from public.weekly_manager_scores where week_id = ep.week_id;
    insert into public.weekly_manager_scores (league_id, manager_id, week_id, roster_points, prediction_points, grand_finale_points, total_points)
    select league_id, manager_id, week_id, roster_points, prediction_points, grand_finale_points, total_points
    from jsonb_to_recordset(p_plan->'weeklyScores') as r(league_id uuid, manager_id uuid, week_id uuid, roster_points numeric, prediction_points numeric, grand_finale_points numeric, total_points numeric);
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.commit_episode_publication(p_episode_id uuid, p_published_by uuid, p_snapshot jsonb, p_plan jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
 SET lock_timeout TO '5s'
AS $function$
declare
  v_episode public.episodes%rowtype;
  v_override public.draft_episode_overrides%rowtype;
  v_draft public.draft_dance_scores%rowtype;
  v_team public.episode_teams%rowtype;
  v_dance_id uuid;
  v_preserved uuid[];
  v_departed uuid[];
  v_future uuid[];
  v_couple uuid;
  v_celebrity text;
  v_blocker text;
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
    public.episode_participants, public.draft_couple_releases,
    public.weekly_manager_scores, public.episode_teams, public.episode_team_members,
    public.episode_team_marks, public.episode_team_scores, public.episode_team_couple_marks in share row exclusive mode;

  if not exists (select 1 from public.profiles where id = p_published_by and is_super_admin) then
    raise exception 'Not authorized to publish results';
  end if;
  perform public.assert_special_dance_plan(p_episode_id, p_plan);
  if p_snapshot is null or p_snapshot->>'_revision' is null or p_snapshot->>'_revision' is distinct from public.episode_publication_snapshot(p_episode_id)->>'_revision' then
    raise exception 'Results or scoring inputs changed. Refresh and try again.';
  end if;
  select * into strict v_episode from public.episodes where id = p_episode_id;
  select * into strict v_override from public.draft_episode_overrides where episode_id = p_episode_id;
  if v_episode.results_published_at is not null and (
    exists (select 1 from public.episode_results live where live.episode_id = p_episode_id
      and not exists (select 1 from public.draft_episode_results draft where draft.episode_id = p_episode_id and draft.couple_id = live.couple_id))
    or exists (select 1 from public.dance_scores live where live.episode_id = p_episode_id and live.team_id is null
      and not exists (select 1 from public.draft_dance_scores draft where draft.episode_id = p_episode_id and draft.couple_id = live.couple_id)
      and not exists (select 1 from public.draft_episode_results draft where draft.episode_id = p_episode_id and draft.couple_id = live.couple_id and draft.outcome = 'bye'))
  ) then raise exception 'Incomplete correction draft. Reload the complete published episode before correcting it.'; end if;

  if not exists (select 1 from public.draft_episode_results where episode_id = p_episode_id) then
    raise exception 'No results to publish for this episode';
  end if;

  for v_team in select * from public.episode_teams where episode_id = p_episode_id order by sort_order, created_at loop
    continue when not exists (select 1 from public.episode_team_members where team_id = v_team.id);
    v_blocker := public.special_dance_blocker(v_team.id, 'before finishing the week');
    if v_blocker is not null then raise exception '%', v_blocker; end if;
  end loop;

  select coalesce(array_agg(distinct couple_id), '{}'::uuid[]) into v_preserved
  from public.dance_scores where episode_id = p_episode_id and team_id is null and v_episode.results_published_at is null;
  if cardinality(v_preserved) > 0 and exists (
    select 1 from public.draft_dance_scores where episode_id = p_episode_id and not (couple_id = any(v_preserved))
  ) then raise exception 'Post every couple before publishing results'; end if;
  foreach v_couple in array v_preserved loop
    if public.episode_couple_dance_signature(p_episode_id, v_couple, true) is distinct from public.episode_couple_dance_signature(p_episode_id, v_couple, false) then
      select p.name into v_celebrity from public.couples c join public.people p on p.id = c.celebrity_id where c.id = v_couple;
      raise exception 'Posted scores for % differ from their draft (an edit arrived after they were posted). Un-Post and Publish them again before finishing the week.', coalesce(v_celebrity, 'a couple');
    end if;
  end loop;

  delete from public.dance_scores where episode_id = p_episode_id and team_id is null and not (couple_id = any(v_preserved));
  for v_draft in select * from public.draft_dance_scores where episode_id = p_episode_id and not (couple_id = any(v_preserved)) loop
    insert into public.dance_scores (episode_id, couple_id, dance_style_id, song_title, total_score, scaled_score)
    select p_episode_id, v_draft.couple_id, v_draft.dance_style_id, v_draft.song_title,
      coalesce(sum(score), 0), coalesce(sum(score) * 3.0 / nullif(count(*), 0), 0)
    from public.draft_judge_scores where draft_dance_score_id = v_draft.id
    returning id into v_dance_id;
    insert into public.judge_scores (dance_score_id, judge_id, score)
    select v_dance_id, judge_id, score from public.draft_judge_scores where draft_dance_score_id = v_draft.id;
  end loop;

  for v_team in select * from public.episode_teams where episode_id = p_episode_id order by sort_order, created_at loop
    if exists (select 1 from public.episode_team_members where team_id = v_team.id) then
      perform public.materialize_team_scores(p_episode_id, v_team.id);
      update public.episode_teams set posted_at = coalesce(posted_at, now()), posted_by = coalesce(posted_by, p_published_by) where id = v_team.id;
    end if;
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

  if v_episode.week_id is not null then
    if exists (select 1 from jsonb_to_recordset(p_plan->'weeklyScores') as s(week_id uuid) where week_id is distinct from v_episode.week_id) then
      raise exception 'Score rows must belong to this competition week';
    end if;
    delete from public.weekly_manager_scores where week_id = v_episode.week_id;
    insert into public.weekly_manager_scores (league_id, manager_id, week_id, roster_points, prediction_points, grand_finale_points, total_points)
    select league_id, manager_id, week_id, roster_points, prediction_points, grand_finale_points, total_points
    from jsonb_to_recordset(p_plan->'weeklyScores') as s(league_id uuid, manager_id uuid, week_id uuid, roster_points numeric, prediction_points numeric, grand_finale_points numeric, total_points numeric);
  end if;

  update public.episodes set status = 'completed', results_published_at = now(), results_published_by = p_published_by,
    guest_judge_name = v_override.guest_judge_name, judges_save_available = v_override.judges_save_available
  where id = p_episode_id;
  delete from public.draft_episode_overrides where episode_id = p_episode_id;
  delete from public.draft_dance_scores where episode_id = p_episode_id;
  delete from public.draft_episode_results where episode_id = p_episode_id;
  delete from public.draft_episode_in_jeopardy_couples where episode_id = p_episode_id;
  delete from public.draft_couple_releases where episode_id = p_episode_id;
end;
$function$;

-- The special dance mode a round's heats are scored in.
create or replace function public.round_special_mode(p_scoring text)
returns text language sql immutable set search_path = '' as $$
  select case p_scoring when 'couple_marks' then 'couple_marks' when 'team_marks' then 'marks'
    when 'fixed_bonus' then 'points' when 'ranked_points' then 'points' end;
$$;

-- "Dance-Off 1" when a round has several heats, the bare type when it has one.
create or replace function public.round_heat_name(p_round_type text, p_heat int, p_unit_count int)
returns text language sql immutable set search_path = '' as $$
  select case when p_unit_count > 1 then btrim(p_round_type) || ' ' || p_heat else btrim(p_round_type) end;
$$;

-- Removes one heat, team or immunity row of a round. A posted dance must be
-- un-posted first, and a heat with saved scores cleared first; an immunity
-- row's points follow its exceptions, so only posting holds it.
create or replace function public.drop_round_unit(p_team_id uuid)
returns void language plpgsql set search_path = '' as $$
declare team public.episode_teams;
begin
  select * into team from public.episode_teams where id = p_team_id for update;
  if team.id is null then return; end if;
  if team.posted_at is not null or exists (select 1 from public.dance_scores where team_id = team.id) then
    raise exception 'Un-post % before removing it', public.special_dance_label(team);
  end if;
  if team.heat_number is not null and (
    exists (select 1 from public.episode_team_marks where team_id = team.id)
    or exists (select 1 from public.episode_team_couple_marks where team_id = team.id)
    or exists (select 1 from public.episode_team_scores where team_id = team.id and points is not null)) then
    raise exception '% already has scores. Clear them on Enter Results first.', public.special_dance_label(team);
  end if;
  delete from public.episode_teams where id = team.id;
end $$;

-- Heats past p_keep go; with p_keep 0 the immunity row goes too.
create or replace function public.drop_round_units(p_round_id uuid, p_keep int)
returns void language plpgsql set search_path = '' as $$
declare v_id uuid;
begin
  for v_id in select id from public.episode_teams where round_id = p_round_id
      and (heat_number > p_keep or (heat_number is null and p_keep = 0)) order by heat_number loop
    perform public.drop_round_unit(v_id);
  end loop;
end $$;

-- An immune couple's bonus is a one-couple Points row in the round's
-- immunity dance: the exception's own bonus, else the round's winner's bonus
-- (a fixed-bonus round only). A null bonus leaves the row blank, which holds
-- Finish Week until the show says how much.
create or replace function public.sync_round_immunity(p_round_id uuid, p_actor_id uuid)
returns void language plpgsql set search_path = '' as $$
declare r public.episode_rounds; v_team public.episode_teams; v_members uuid[]; v_id uuid;
begin
  select * into strict r from public.episode_rounds where id = p_round_id;
  select coalesce(array_agg(x.couple_id order by x.created_at, x.couple_id), '{}'::uuid[]) into v_members
  from public.episode_round_exceptions x
  where x.round_id = r.id and x.kind = 'immune' and (x.bonus_points is not null or r.scoring = 'fixed_bonus');
  select * into v_team from public.episode_teams where round_id = r.id and heat_number is null;
  if cardinality(v_members) = 0 then
    if v_team.id is not null then perform public.drop_round_unit(v_team.id); end if;
    return;
  end if;
  if v_team.posted_at is not null and exists (
    select 1 from public.episode_round_exceptions x
    left join public.episode_team_scores s on s.team_id = v_team.id and s.couple_id = x.couple_id
    where x.round_id = r.id and x.couple_id = any(v_members) and s.points is distinct from coalesce(x.bonus_points, r.bonus_points)) then
    raise exception 'Un-post % before changing its bonus', public.special_dance_label(v_team);
  end if;
  v_id := public.save_special_dance(r.episode_id, p_actor_id, jsonb_build_object(
    'id', v_team.id, 'danceType', 'Immunity', 'name', r.round_type || ' Immunity',
    'memberCoupleIds', to_jsonb(v_members), 'scoringMode', 'points',
    'roundId', r.id, 'heatNumber', null, 'sortOrder', r.position * 100 + 99));
  insert into public.episode_team_scores (team_id, couple_id, points, result, updated_by)
  select v_id, x.couple_id, coalesce(x.bonus_points, r.bonus_points), 'Immune', p_actor_id
  from public.episode_round_exceptions x where x.round_id = r.id and x.couple_id = any(v_members)
  on conflict (team_id, couple_id) do update
    set points = excluded.points, result = excluded.result, updated_at = now(), updated_by = excluded.updated_by;
end $$;

-- A fixed-bonus round's Winner rows carry the round's bonus, and its immune
-- couples follow it too.
create or replace function public.refresh_round_points(p_round_id uuid, p_actor_id uuid)
returns void language plpgsql set search_path = '' as $$
declare r public.episode_rounds; team public.episode_teams;
begin
  select * into strict r from public.episode_rounds where id = p_round_id;
  if r.scoring = 'fixed_bonus' then
    select t.* into team from public.episode_teams t join public.episode_team_scores s on s.team_id = t.id
    where t.round_id = r.id and t.heat_number is not null and t.posted_at is not null
      and lower(s.result) = 'winner' and s.points is distinct from r.bonus_points
    limit 1;
    if team.id is not null then raise exception 'Un-post % before changing the winner''s bonus', public.special_dance_label(team); end if;
    update public.episode_team_scores s set points = r.bonus_points, updated_at = now(), updated_by = p_actor_id
    from public.episode_teams t
    where t.id = s.team_id and t.round_id = r.id and t.heat_number is not null
      and lower(s.result) = 'winner' and s.points is distinct from r.bonus_points;
  end if;
  perform public.sync_round_immunity(r.id, p_actor_id);
end $$;

-- 'withdrawn' while any round has the couple Withdrawn, 'bye' while every
-- round has them Not Dancing, else null.
create or replace function public.couple_night_exception(p_episode_id uuid, p_couple_id uuid)
returns text language sql stable set search_path = '' as $$
  select case
    when exists (select 1 from public.episode_round_exceptions x
                 where x.episode_id = p_episode_id and x.couple_id = p_couple_id and x.kind = 'withdrawn') then 'withdrawn'
    when exists (select 1 from public.episode_rounds r where r.episode_id = p_episode_id)
     and not exists (select 1 from public.episode_rounds r where r.episode_id = p_episode_id
                     and not exists (select 1 from public.episode_round_exceptions x
                                     where x.round_id = r.id and x.couple_id = p_couple_id and x.kind = 'not_dancing')) then 'bye'
  end;
$$;

-- Marks (p_kind set) or clears (p_kind null) one couple's exception in the
-- given rounds. Withdrawn always spans the whole night. Being out of a round
-- takes the couple out of its heats; a heat left empty goes back to a
-- placeholder. The draft outcome follows the night: Withdrawn, or Did Not
-- Dance when every round has them Not Dancing, and back to Safe when that
-- stops being true; marking Immune ticks the Immunity box and clearing the
-- couple's last Immune unticks it. Callers check the actor.
create or replace function public.apply_round_exception(
  p_episode_id uuid, p_actor_id uuid, p_couple_id uuid, p_round_ids uuid[], p_kind text, p_note text, p_bonus numeric)
returns void language plpgsql set search_path = '' as $$
declare
  ep public.episodes; v_rounds uuid[]; team public.episode_teams; v_round_id uuid;
  v_before text; v_after text; v_outcome text; v_new text; v_immune_before boolean; v_immune_after boolean;
begin
  select * into strict ep from public.episodes where id = p_episode_id;
  if not exists (select 1 from public.couples where id = p_couple_id and season_id = ep.season_id) then
    raise exception 'That couple is not in this season';
  end if;
  if p_kind is not null and p_kind not in ('immune', 'not_dancing', 'withdrawn') then
    raise exception 'An exception is Immune, Not Dancing or Withdrawn';
  end if;
  if length(btrim(coalesce(p_note, ''))) > 200 then raise exception 'A note is limited to 200 characters'; end if;
  if p_bonus is not null and (p_kind is distinct from 'immune' or p_bonus not between -100 and 100 or p_bonus * 2 <> trunc(p_bonus * 2)) then
    raise exception 'An immunity bonus is between -100 and 100 in steps of 0.5';
  end if;
  if p_kind = 'withdrawn' or (p_kind is null and exists (select 1 from public.episode_round_exceptions
      where episode_id = ep.id and couple_id = p_couple_id and kind = 'withdrawn' and round_id = any(p_round_ids))) then
    select array_agg(id) into v_rounds from public.episode_rounds where episode_id = ep.id;
  else
    v_rounds := p_round_ids;
  end if;
  if coalesce(cardinality(v_rounds), 0) = 0 or exists (select 1 from unnest(v_rounds) u(id)
      where not exists (select 1 from public.episode_rounds er where er.id = u.id and er.episode_id = ep.id)) then
    raise exception 'That round is no longer on this episode. Reload and try again.';
  end if;
  if p_kind = 'immune' and exists (select 1 from public.episode_rounds er where er.id = any(v_rounds) and er.kind <> 'special') then
    raise exception 'Immune applies to a special round, like a dance-off';
  end if;

  v_before := public.couple_night_exception(ep.id, p_couple_id);
  v_immune_before := exists (select 1 from public.episode_round_exceptions where episode_id = ep.id and couple_id = p_couple_id and kind = 'immune');
  if p_kind is null then
    delete from public.episode_round_exceptions where round_id = any(v_rounds) and couple_id = p_couple_id;
  else
    insert into public.episode_round_exceptions (round_id, episode_id, couple_id, kind, note, bonus_points, created_by)
    select er.id, ep.id, p_couple_id, p_kind, nullif(btrim(coalesce(p_note, '')), ''), p_bonus, p_actor_id
    from public.episode_rounds er where er.id = any(v_rounds)
    on conflict (round_id, couple_id) do update
      set kind = excluded.kind, note = excluded.note, bonus_points = excluded.bonus_points, updated_at = now();
    for team in select t.* from public.episode_teams t join public.episode_team_members m on m.team_id = t.id
        where t.round_id = any(v_rounds) and t.heat_number is not null and m.couple_id = p_couple_id for update of t loop
      if team.posted_at is not null then
        raise exception 'Un-post % before marking this couple out of it', public.special_dance_label(team);
      end if;
      delete from public.episode_team_members where team_id = team.id and couple_id = p_couple_id;
      delete from public.episode_team_scores where team_id = team.id and couple_id = p_couple_id;
      delete from public.episode_team_couple_marks where team_id = team.id and couple_id = p_couple_id;
      if not exists (select 1 from public.episode_team_members where team_id = team.id) then
        delete from public.episode_teams where id = team.id;
      end if;
    end loop;
  end if;
  for v_round_id in select id from public.episode_rounds where id = any(v_rounds) and kind = 'special' order by position loop
    perform public.sync_round_immunity(v_round_id, p_actor_id);
  end loop;

  v_after := public.couple_night_exception(ep.id, p_couple_id);
  v_immune_after := exists (select 1 from public.episode_round_exceptions where episode_id = ep.id and couple_id = p_couple_id and kind = 'immune');
  if v_after is distinct from v_before or v_immune_after is distinct from v_immune_before or p_kind = 'immune' then
    select outcome into v_outcome from public.draft_episode_results where episode_id = ep.id and couple_id = p_couple_id;
    v_new := case
      when v_after is not null then v_after
      when v_before is not null and v_outcome = v_before then 'safe'
      else coalesce(v_outcome, 'safe') end;
    insert into public.draft_episode_overrides (episode_id, guest_judge_name, judges_save_available, updated_at, updated_by)
    values (ep.id, ep.guest_judge_name, ep.judges_save_available, now(), p_actor_id)
    on conflict (episode_id) do nothing;
    insert into public.draft_episode_results (episode_id, couple_id, outcome, had_immunity)
    values (ep.id, p_couple_id, v_new, v_immune_after)
    on conflict (episode_id, couple_id) do update set outcome = excluded.outcome,
      had_immunity = case when v_immune_after is distinct from v_immune_before or p_kind = 'immune' then excluded.had_immunity
                          else public.draft_episode_results.had_immunity end;
    if v_new in ('withdrawn', 'bye') then
      delete from public.draft_episode_in_jeopardy_couples where episode_id = ep.id and couple_id = p_couple_id;
    end if;
  end if;
end $$;

-- Propose tier, from Enter Results.
create or replace function public.save_round_exception(
  p_episode_id uuid, p_actor_id uuid, p_couple_id uuid, p_round_ids uuid[], p_kind text, p_note text, p_bonus numeric)
returns void language plpgsql set search_path = '' as $$
begin
  perform public.assert_episode_draft_actor(p_episode_id, p_actor_id);
  perform public.apply_round_exception(p_episode_id, p_actor_id, p_couple_id, p_round_ids, p_kind, p_note, p_bonus);
end $$;

-- Propose tier: the winner's bonus is often only announced on air.
create or replace function public.set_round_bonus(p_episode_id uuid, p_actor_id uuid, p_round_id uuid, p_bonus numeric)
returns void language plpgsql set search_path = '' as $$
declare r public.episode_rounds;
begin
  perform public.assert_episode_draft_actor(p_episode_id, p_actor_id);
  select * into r from public.episode_rounds where id = p_round_id and episode_id = p_episode_id for update;
  if r.id is null then raise exception 'That round is no longer on this episode. Reload and try again.'; end if;
  if r.scoring <> 'fixed_bonus' then raise exception 'Only a round scored by a winner''s bonus has one'; end if;
  if p_bonus is not null and (p_bonus not between -100 and 100 or p_bonus * 2 <> trunc(p_bonus * 2)) then
    raise exception 'A bonus is between -100 and 100 in steps of 0.5';
  end if;
  update public.episode_rounds set bonus_points = p_bonus, updated_at = now() where id = r.id;
  perform public.refresh_round_points(r.id, p_actor_id);
end $$;

-- Propose tier: one couple's marks in a heat judged couple by couple.
create or replace function public.save_team_couple_marks(
  p_episode_id uuid, p_team_id uuid, p_actor_id uuid, p_couple_id uuid, p_marks jsonb)
returns void language plpgsql set search_path = '' as $$
declare team public.episode_teams; v_panel uuid[]; mark jsonb; v_score numeric;
begin
  perform public.assert_episode_draft_actor(p_episode_id, p_actor_id);
  select * into team from public.episode_teams where id = p_team_id and episode_id = p_episode_id for update;
  if team.id is null then raise exception 'That special dance is no longer on this episode'; end if;
  if team.scoring_mode <> 'couple_marks' then raise exception '% is not judged couple by couple', public.special_dance_label(team); end if;
  if not exists (select 1 from public.episode_team_members where team_id = team.id and couple_id = p_couple_id) then
    raise exception 'Marks must be for this dance''s participants';
  end if;
  v_panel := public.special_dance_panel(team.id);
  if cardinality(v_panel) not between 2 and 4 then
    raise exception '% needs 2 to 4 judges and this night has %. Set the guest judge on Schedule first.', public.special_dance_label(team), cardinality(v_panel);
  end if;
  if p_marks is null or jsonb_typeof(p_marks) <> 'array' or jsonb_array_length(p_marks) > cardinality(v_panel) then
    raise exception 'Marks must be a list of at most %', cardinality(v_panel);
  end if;
  for mark in select * from jsonb_array_elements(p_marks) loop
    v_score := nullif(mark->>'score', '')::numeric;
    if v_score is null or v_score not between 1 and 10 or v_score <> trunc(v_score) then
      raise exception 'Judge scores must be whole numbers from 1 to 10.';
    end if;
    if not ((mark->>'judgeId')::uuid = any(v_panel)) then raise exception 'Marks must be for this night''s judges'; end if;
  end loop;
  delete from public.episode_team_couple_marks where team_id = team.id and couple_id = p_couple_id;
  insert into public.episode_team_couple_marks (team_id, couple_id, judge_id, score, updated_by)
  select team.id, p_couple_id, (m->>'judgeId')::uuid, (m->>'score')::numeric, p_actor_id from jsonb_array_elements(p_marks) m;
  update public.episode_teams set updated_at = now() where id = team.id;
end $$;

-- Site admin, from Edit Episode: the whole plan in one transaction. Rounds
-- left out are removed with their heats; special rounds keep, add, re-pair or
-- drop heats; auto-named heats are renumbered; exceptions are applied once
-- every round exists. expected_dance_count and the Round Types ticks follow
-- the plan, so their readers keep working.
create or replace function public.save_episode_rounds(p_episode_id uuid, p_actor_id uuid, p_rounds jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  ep public.episodes; actor public.profiles; r public.episode_rounds; existing public.episode_rounds; team public.episode_teams;
  v_round jsonb; v_heat jsonb; x jsonb; v_old public.episode_round_exceptions;
  v_ids uuid[] := '{}'; v_pos int := 0; v_kind text; v_type text; v_scoring text; v_bonus numeric; v_units int;
  v_mode text; v_k int; v_new uuid; v_name text; i int;
begin
  select * into actor from public.profiles where id = p_actor_id;
  if not coalesce(actor.is_super_admin, false) then raise exception 'Only a site admin can plan an episode''s rounds'; end if;
  select * into strict ep from public.episodes where id = p_episode_id for update;
  if p_rounds is null or jsonb_typeof(p_rounds) <> 'array' or jsonb_array_length(p_rounds) = 0 then
    raise exception 'An episode needs at least Round 1';
  end if;
  if jsonb_array_length(p_rounds) > 12 then raise exception 'An episode can have up to 12 rounds'; end if;
  if p_rounds->0->>'kind' is distinct from 'own' or btrim(coalesce(p_rounds->0->>'roundType', '')) <> 'Individual Dance' then
    raise exception 'Round 1 is always the Individual Dance';
  end if;

  for r in select * from public.episode_rounds where episode_id = ep.id
      and id <> all (select (e->>'id')::uuid from jsonb_array_elements(p_rounds) e where nullif(e->>'id', '') is not null) loop
    if ep.results_published_at is not null and exists (select 1 from public.episode_round_exceptions where round_id = r.id) then
      raise exception 'Exceptions on a published week change in a correction on Enter Results';
    end if;
    perform public.drop_round_units(r.id, 0);
    delete from public.episode_rounds where id = r.id;
  end loop;

  set constraints public.episode_rounds_position_key deferred;
  for v_round in select * from jsonb_array_elements(p_rounds) loop
    v_pos := v_pos + 1;
    v_kind := v_round->>'kind';
    v_type := btrim(coalesce(v_round->>'roundType', ''));
    if v_kind is null or v_kind not in ('own', 'special', 'none') then raise exception 'A round is a dance per couple, a special dance or elimination only'; end if;
    if length(v_type) not between 1 and 40 then raise exception 'A round''s type is 1 to 40 characters'; end if;
    v_scoring := case v_kind when 'own' then 'marks' when 'none' then 'none' else v_round->>'scoring' end;
    if v_kind = 'special' and (v_scoring is null or v_scoring not in ('couple_marks', 'fixed_bonus', 'ranked_points', 'team_marks')) then
      raise exception 'Pick how % is scored', v_type;
    end if;
    v_units := case when v_kind = 'special' then coalesce(nullif(v_round->>'unitCount', '')::int, 1) else 0 end;
    if v_kind = 'special' and v_units not between 1 and 12 then raise exception '% can have 1 to 12 heats or teams', v_type; end if;
    v_bonus := case when v_scoring = 'fixed_bonus' then nullif(v_round->>'bonusPoints', '')::numeric end;
    if v_bonus is not null and (v_bonus not between -100 and 100 or v_bonus * 2 <> trunc(v_bonus * 2)) then
      raise exception 'A bonus is between -100 and 100 in steps of 0.5';
    end if;

    existing := null;
    if nullif(v_round->>'id', '') is not null then
      select * into existing from public.episode_rounds where id = (v_round->>'id')::uuid and episode_id = ep.id for update;
      if existing.id is null then raise exception 'That round is no longer on this episode. Reload and try again.'; end if;
      if existing.kind <> v_kind and exists (select 1 from public.episode_teams where round_id = existing.id) then
        raise exception 'Remove % and add it again to change what kind of round it is', existing.round_type;
      end if;
      update public.episode_rounds set position = v_pos, kind = v_kind, round_type = v_type, scoring = v_scoring,
        bonus_points = v_bonus, unit_count = v_units, updated_at = now()
      where id = existing.id returning * into r;
    else
      insert into public.episode_rounds (episode_id, position, kind, round_type, scoring, bonus_points, unit_count)
      values (ep.id, v_pos, v_kind, v_type, v_scoring, v_bonus, v_units) returning * into r;
    end if;
    v_ids := v_ids || r.id;

    if v_kind = 'special' then
      v_mode := public.round_special_mode(v_scoring);
      perform public.drop_round_units(r.id, v_units);
      for team in select * from public.episode_teams where round_id = r.id and heat_number is not null and scoring_mode <> v_mode loop
        perform public.save_special_dance(ep.id, p_actor_id, jsonb_build_object('id', team.id, 'scoringMode', v_mode));
      end loop;
      update public.episode_teams set dance_type = v_type, updated_at = now()
      where round_id = r.id and heat_number is not null and dance_type <> v_type;
      for team in select * from public.episode_teams where round_id = r.id and heat_number is not null and name_is_auto order by heat_number loop
        v_name := public.round_heat_name(v_type, team.heat_number, v_units);
        if team.name <> v_name and not exists (select 1 from public.episode_teams o
            where o.episode_id = ep.id and lower(o.name) = lower(v_name) and o.id <> team.id) then
          update public.episode_teams set name = v_name, updated_at = now() where id = team.id;
        end if;
      end loop;
      if v_round ? 'heats' then
        for v_heat in select * from jsonb_array_elements(v_round->'heats') loop
          v_k := nullif(v_heat->>'heatNumber', '')::int;
          if v_k is null or v_k not between 1 and v_units then raise exception 'A heat of % is numbered 1 to %', v_type, v_units; end if;
          select * into team from public.episode_teams where round_id = r.id and heat_number = v_k;
          if jsonb_array_length(coalesce(v_heat->'coupleIds', '[]'::jsonb)) = 0 then
            if team.id is not null then perform public.drop_round_unit(team.id); end if;
          elsif team.id is not null then
            perform public.save_special_dance(ep.id, p_actor_id, jsonb_build_object('id', team.id, 'memberCoupleIds', v_heat->'coupleIds'));
          else
            v_new := public.save_special_dance(ep.id, p_actor_id, jsonb_build_object(
              'danceType', v_type, 'name', public.round_heat_name(v_type, v_k, v_units),
              'memberCoupleIds', v_heat->'coupleIds', 'scoringMode', v_mode,
              'roundId', r.id, 'heatNumber', v_k, 'sortOrder', v_pos * 100 + v_k));
            update public.episode_teams set name_is_auto = true where id = v_new;
          end if;
        end loop;
      end if;
      perform public.refresh_round_points(r.id, p_actor_id);
    end if;
  end loop;
  set constraints public.episode_rounds_position_key immediate;

  -- Exceptions once every round exists, since Withdrawn spans them all.
  for i in 1 .. jsonb_array_length(p_rounds) loop
    v_round := p_rounds->(i - 1);
    continue when not (v_round ? 'exceptions');
    for v_old in select * from public.episode_round_exceptions e where e.round_id = v_ids[i]
        and not exists (select 1 from jsonb_array_elements(v_round->'exceptions') n where (n->>'coupleId')::uuid = e.couple_id) loop
      if ep.results_published_at is not null then raise exception 'Exceptions on a published week change in a correction on Enter Results'; end if;
      perform public.apply_round_exception(ep.id, p_actor_id, v_old.couple_id, array[v_ids[i]], null, null, null);
    end loop;
    for x in select * from jsonb_array_elements(v_round->'exceptions') loop
      continue when exists (select 1 from public.episode_round_exceptions e where e.round_id = v_ids[i]
        and e.couple_id = (x->>'coupleId')::uuid and e.kind = x->>'kind'
        and e.note is not distinct from nullif(btrim(coalesce(x->>'note', '')), '')
        and e.bonus_points is not distinct from nullif(x->>'bonusPoints', '')::numeric);
      if ep.results_published_at is not null then raise exception 'Exceptions on a published week change in a correction on Enter Results'; end if;
      perform public.apply_round_exception(ep.id, p_actor_id, (x->>'coupleId')::uuid, array[v_ids[i]],
        x->>'kind', x->>'note', nullif(x->>'bonusPoints', '')::numeric);
    end loop;
  end loop;

  update public.episodes set expected_dance_count =
    (select count(*) from public.episode_rounds where episode_id = ep.id and kind = 'own')
  where id = ep.id;
  delete from public.episode_round_types where episode_id = ep.id;
  insert into public.episode_round_types (episode_id, round_type_id)
  select ep.id, rt.id from public.round_types rt
  where exists (select 1 from public.episode_rounds er where er.episode_id = ep.id and lower(btrim(er.round_type)) = lower(btrim(rt.name)));
  return to_jsonb(v_ids);
end $$;

do $$ declare f text; begin
  foreach f in array array[
    'round_special_mode(text)', 'round_heat_name(text, int, int)', 'drop_round_unit(uuid)', 'drop_round_units(uuid, int)',
    'sync_round_immunity(uuid, uuid)', 'refresh_round_points(uuid, uuid)', 'couple_night_exception(uuid, uuid)',
    'apply_round_exception(uuid, uuid, uuid, uuid[], text, text, numeric)',
    'save_round_exception(uuid, uuid, uuid, uuid[], text, text, numeric)', 'set_round_bonus(uuid, uuid, uuid, numeric)',
    'save_team_couple_marks(uuid, uuid, uuid, uuid, jsonb)', 'save_episode_rounds(uuid, uuid, jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- Every episode without a plan gets one from what it already holds: Round 1,
-- a Second Dance (then Dance 3, ...) per extra dance per couple, and one
-- special round per Dance Type among its special dances, heats numbered by
-- sort order and then the number an auto-named heat already carries
-- ("Dance-Off" before "Dance-Off 2"). An auto-named first heat of several is
-- renamed ("Dance-Off" becomes "Dance-Off 1"). An Immunity special (a
-- one-couple bonus entered by hand) becomes the first special round's
-- immunity row, its couples marked Immune with their points as their own
-- bonus, so the plan never pays them twice. A Dance-Off round with no
-- saved marks is scored by the winner's bonus, its heats switched to points;
-- a scored marks round keeps its shared marks. Scores, members and posted
-- rows are not touched. Episodes that already have rounds are skipped.
do $$
declare
  e record; g record; im record; v_round uuid; v_pos int; v_scoring text; i int;
begin
  for e in select * from public.episodes ep where not exists (select 1 from public.episode_rounds r where r.episode_id = ep.id) order by ep.id loop
    insert into public.episode_rounds (episode_id, position, kind, round_type, scoring)
    values (e.id, 1, 'own', 'Individual Dance', 'marks');
    v_pos := 1;
    for i in 2 .. greatest(coalesce(e.expected_dance_count, 1), 1) loop
      v_pos := v_pos + 1;
      insert into public.episode_rounds (episode_id, position, kind, round_type, scoring)
      values (e.id, v_pos, 'own', case when i = 2 then 'Second Dance' else 'Dance ' || i end, 'marks');
    end loop;
    for g in
      select t.dance_type, count(*)::int as n, min(t.sort_order) as first_sort, min(t.created_at) as first_created,
        bool_and(t.scoring_mode = 'points') as all_points,
        bool_or(t.scoring_mode = 'marks' and exists (select 1 from public.episode_team_marks k where k.team_id = t.id)) as marked
      from public.episode_teams t
      where t.episode_id = e.id and t.round_id is null and lower(btrim(t.dance_type)) <> 'immunity'
      group by t.dance_type
      order by min(t.sort_order), min(t.created_at)
    loop
      v_pos := v_pos + 1;
      v_scoring := case
        when lower(g.dance_type) = 'dance-off' and not g.marked then 'fixed_bonus'
        when g.all_points then 'ranked_points'
        else 'team_marks' end;
      insert into public.episode_rounds (episode_id, position, kind, round_type, scoring, unit_count)
      values (e.id, v_pos, 'special', g.dance_type, v_scoring, least(g.n, 12))
      returning id into v_round;
      update public.episode_teams t set round_id = v_round, heat_number = o.n
      from (
        select id, row_number() over (
          order by sort_order, coalesce((regexp_match(name, ' (\d+)$'))[1]::int, 1), created_at, name) as n
        from public.episode_teams where episode_id = e.id and dance_type = g.dance_type and round_id is null
      ) o
      where t.id = o.id and o.n <= 12;
      update public.episode_teams set scoring_mode = 'points', updated_at = now()
      where round_id = v_round and v_scoring = 'fixed_bonus' and scoring_mode = 'marks';
      if g.n > 1 then
        update public.episode_teams t set name = public.round_heat_name(t.dance_type, t.heat_number, g.n)
        where t.round_id = v_round and t.name_is_auto and t.name <> public.round_heat_name(t.dance_type, t.heat_number, g.n)
          and not exists (select 1 from public.episode_teams o where o.episode_id = e.id and o.id <> t.id
                          and lower(o.name) = lower(public.round_heat_name(t.dance_type, t.heat_number, g.n)));
      end if;
    end loop;
    for im in select t.id from public.episode_teams t
        where t.episode_id = e.id and t.round_id is null and lower(btrim(t.dance_type)) = 'immunity'
        order by t.sort_order, t.created_at loop
      v_round := null;
      select r.id into v_round from public.episode_rounds r
      where r.episode_id = e.id and r.kind = 'special'
        and not exists (select 1 from public.episode_teams i where i.round_id = r.id and i.heat_number is null)
      order by r.position limit 1;
      exit when v_round is null;
      update public.episode_teams set round_id = v_round, heat_number = null where id = im.id;
      insert into public.episode_round_exceptions (round_id, episode_id, couple_id, kind, bonus_points)
      select v_round, e.id, m.couple_id, 'immune', s.points
      from public.episode_team_members m
      left join public.episode_team_scores s on s.team_id = m.team_id and s.couple_id = m.couple_id
      where m.team_id = im.id
      on conflict (round_id, couple_id) do nothing;
    end loop;
  end loop;
end $$;

commit;
