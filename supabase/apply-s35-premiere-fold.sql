-- S35 premiere data-fold + exhibition flag.
-- Run in the Supabase Dashboard SQL Editor against the live project.
-- schema.sql remains the greenfield source of truth.
--
-- Product:
--   Competition unit = week (aka round). Fan copy is Week N, not TV episode.
--   Do NOT reintroduce week_part. Premiere nights 1+2 fold into week 1.
--   Interview / zero-dance night is exhibition (is_scoring = false) and must
--   not consume a competition week_number. This script deletes it when unused
--   (no dances/results); otherwise parks it at week_number 0.
--   Do NOT wipe weekly_manager_scores globally (owner handles separately).
--   Scores for deleted episode ids only are reassigned or removed as needed.
--
-- Choices:
--   Theme: this script does not rewrite it — owner sets week-1 copy in admin.
--   airs_at: the earlier night (night 1).
--   episode_participants: cleared after merge (full cast = unrestricted).
--
-- Idempotent-ish: folding only runs when weeks 1+2 still look like a split
-- premiere (disjoint participants or disjoint dance-score couples). Interview
-- cleanup and contiguous renumber are safe to re-run.
--
-- Apply BEFORE deploying the app code that filters episodes.is_scoring.

begin;

alter table public.episodes
  add column if not exists is_scoring boolean not null default true;

comment on column public.episodes.is_scoring is
  'Competition/fantasy week. False = exhibition (interview night). Results/Picks carousels omit these. Default true.';

-- Skip exhibition nights when the draft auto-advances the hard deadline.
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
        (select min(e.week_number) from public.episodes e
         where e.season_id = public.active_season_id() and e.airs_at > now() and e.is_scoring),
        ss.judges_score_starts_week
      )
    )
  end
  from public.leagues l
  join public.scoring_settings ss on ss.league_id = l.id
  where l.id = p_league_id;
$$;

do $$
declare
  v_season_id uuid;
  v_season_name text;
  v_night1 public.episodes;
  v_night2 public.episodes;
  v_interview public.episodes;
  v_night2_old_week int;
  v_interview_old_week int;
  v_fold boolean := false;
  v_night1_participants int;
  v_night2_participants int;
  v_overlap_participants int;
  v_night1_dance_couples int;
  v_night2_dance_couples int;
  v_overlap_dance_couples int;
  v_ep record;
  v_remap record;
  v_deleted_scores int;
  v_deleted_predictions int;
begin
  select id, name into v_season_id, v_season_name
  from public.seasons
  where is_active
  limit 1;

  if v_season_id is null then
    raise exception 'No active season — aborting';
  end if;

  raise notice '=== BEFORE (%) ===', v_season_name;
  for v_ep in
    select
      e.week_number,
      e.id,
      e.theme,
      e.status,
      e.airs_at,
      e.is_scoring,
      e.expected_dance_count,
      (select count(*) from public.dance_scores ds where ds.episode_id = e.id) as dances,
      (select count(*) from public.episode_results er where er.episode_id = e.id) as results,
      (select count(*) from public.episode_participants ep where ep.episode_id = e.id) as participants
    from public.episodes e
    where e.season_id = v_season_id
    order by e.week_number
  loop
    raise notice 'week % id=% theme=% status=% scoring=% dances=% results=% participants=% airs_at=%',
      v_ep.week_number, v_ep.id, coalesce(v_ep.theme, '∅'), v_ep.status,
      v_ep.is_scoring, v_ep.dances, v_ep.results, v_ep.participants, v_ep.airs_at;
  end loop;

  select * into v_night1 from public.episodes
  where season_id = v_season_id and week_number = 1;
  select * into v_night2 from public.episodes
  where season_id = v_season_id and week_number = 2;

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
      raise notice 'Folding week 2 (%) into week 1 (%)', v_night2.id, v_night1.id;
      v_night2_old_week := v_night2.week_number;

      -- dance_scores / judge_scores (judge_scores follow dance_score_id)
      update public.dance_scores set episode_id = v_night1.id where episode_id = v_night2.id;
      update public.draft_dance_scores set episode_id = v_night1.id where episode_id = v_night2.id;

      -- episode_results: keep week-1 row on (episode, couple) conflict
      delete from public.episode_results a
      using public.episode_results b
      where a.episode_id = v_night2.id
        and b.episode_id = v_night1.id
        and a.couple_id = b.couple_id;
      update public.episode_results set episode_id = v_night1.id where episode_id = v_night2.id;

      delete from public.draft_episode_results a
      using public.draft_episode_results b
      where a.episode_id = v_night2.id
        and b.episode_id = v_night1.id
        and a.couple_id = b.couple_id;
      update public.draft_episode_results set episode_id = v_night1.id where episode_id = v_night2.id;

      update public.episode_custom_moments set episode_id = v_night1.id where episode_id = v_night2.id;
      update public.draft_episode_custom_moments set episode_id = v_night1.id where episode_id = v_night2.id;

      delete from public.draft_episode_overrides
      where episode_id = v_night2.id
        and exists (select 1 from public.draft_episode_overrides where episode_id = v_night1.id);
      update public.draft_episode_overrides set episode_id = v_night1.id where episode_id = v_night2.id;

      -- predictions: keep week-1 pick if both exist
      delete from public.predictions a
      using public.predictions b
      where a.episode_id = v_night2.id
        and b.episode_id = v_night1.id
        and a.league_id = b.league_id
        and a.manager_id = b.manager_id;
      update public.predictions set episode_id = v_night1.id where episode_id = v_night2.id;

      -- weekly_manager_scores: keep week-1 if both exist (owner may wipe all scores separately)
      delete from public.weekly_manager_scores a
      using public.weekly_manager_scores b
      where a.episode_id = v_night2.id
        and b.episode_id = v_night1.id
        and a.league_id = b.league_id
        and a.manager_id = b.manager_id;
      update public.weekly_manager_scores set episode_id = v_night1.id where episode_id = v_night2.id;

      -- Full cast after merge = unrestricted (no episode_participants rows)
      delete from public.episode_participants
      where episode_id in (v_night1.id, v_night2.id);

      update public.episodes
      set
        airs_at = least(v_night1.airs_at, v_night2.airs_at),
        expected_dance_count = greatest(v_night1.expected_dance_count, v_night2.expected_dance_count, 1),
        is_elimination_week = v_night1.is_elimination_week or v_night2.is_elimination_week,
        is_double_elimination_week = v_night1.is_double_elimination_week or v_night2.is_double_elimination_week,
        is_finale = false,
        is_scoring = true,
        status = case
          when v_night1.status = 'completed' or v_night2.status = 'completed' then 'completed'
          when v_night1.status = 'locked' or v_night2.status = 'locked' then 'locked'
          else 'upcoming'
        end,
        results_published_at = coalesce(v_night1.results_published_at, v_night2.results_published_at),
        results_published_by = coalesce(v_night1.results_published_by, v_night2.results_published_by),
        guest_judge_name = coalesce(v_night1.guest_judge_name, v_night2.guest_judge_name),
        judges_save_available = v_night1.judges_save_available or v_night2.judges_save_available
      where id = v_night1.id;

      -- leftover FKs without ON DELETE CASCADE
      delete from public.weekly_manager_scores where episode_id = v_night2.id;
      delete from public.predictions where episode_id = v_night2.id;

      delete from public.episodes where id = v_night2.id;
      raise notice 'Deleted folded night-2 episode %', v_night2.id;
    else
      raise notice 'Skipping premiere fold — week 1+2 do not look like a disjoint split premiere';
    end if;
  else
    raise notice 'Skipping premiere fold — week 1 or week 2 is missing';
  end if;

  -- Interview / exhibition night: theme match, or a completed zero-dance
  -- non-finale row that is not the (possibly already folded) premiere.
  select e.* into v_interview
  from public.episodes e
  where e.season_id = v_season_id
    and e.id is distinct from v_night1.id
    and (
      coalesce(e.theme, '') ~* 'interview'
      or (
        e.status = 'completed'
        and not e.is_finale
        and e.week_number >= 3
        and not exists (select 1 from public.dance_scores ds where ds.episode_id = e.id)
        and not exists (select 1 from public.episode_results er where er.episode_id = e.id)
        and (e.expected_dance_count = 0 or coalesce(nullif(trim(e.theme), ''), '') = '')
      )
    )
  order by
    case when coalesce(e.theme, '') ~* 'interview' then 0 else 1 end,
    e.week_number
  limit 1;

  if v_interview.id is not null then
    v_interview_old_week := v_interview.week_number;
    raise notice 'Interview/exhibition candidate: week % id=% theme=%',
      v_interview.week_number, v_interview.id, coalesce(v_interview.theme, '∅');

    if exists (select 1 from public.dance_scores where episode_id = v_interview.id)
       or exists (select 1 from public.episode_results where episode_id = v_interview.id) then
      -- Keep the row but park it off the competition timeline.
      update public.episodes
      set is_scoring = false,
          week_number = 0
      where id = v_interview.id
        and not exists (
          select 1 from public.episodes
          where season_id = v_season_id and week_number = 0 and id <> v_interview.id
        );
      if not found then
        raise exception 'Could not park interview episode at week_number 0 (collision)';
      end if;
      raise notice 'Parked interview episode % at week_number 0 (is_scoring=false)', v_interview.id;
    else
      delete from public.weekly_manager_scores where episode_id = v_interview.id;
      get diagnostics v_deleted_scores = row_count;
      delete from public.predictions where episode_id = v_interview.id;
      get diagnostics v_deleted_predictions = row_count;
      delete from public.episodes where id = v_interview.id;
      raise notice 'Deleted unused interview episode % (scores removed: %, predictions removed: %)',
        v_interview.id, v_deleted_scores, v_deleted_predictions;
    end if;
  else
    raise notice 'No interview/exhibition episode detected';
  end if;

  -- Remap old competition week_numbers → dense 1..N by air date.
  create temporary table week_remap (
    old_week int primary key,
    new_week int not null
  ) on commit drop;

  insert into week_remap (old_week, new_week)
  select e.week_number, row_number() over (order by e.airs_at, e.week_number)::int
  from public.episodes e
  where e.season_id = v_season_id and e.is_scoring;

  if v_night2_old_week is not null then
    insert into week_remap (old_week, new_week)
    values (v_night2_old_week, 1)
    on conflict (old_week) do nothing;
  end if;

  raise notice '=== WEEK REMAP ===';
  for v_remap in select old_week, new_week from week_remap order by old_week
  loop
    raise notice 'old week % → new week %', v_remap.old_week, v_remap.new_week;
  end loop;

  update public.couples c
  set elimination_week = m.new_week
  from week_remap m
  where c.season_id = v_season_id
    and c.elimination_week = m.old_week
    and m.new_week > 0
    and c.elimination_week is distinct from m.new_week;

  -- Occupancy timelines: skip a row if the remapped start_week would collide.
  update public.roster_slots rs
  set start_week = m.new_week
  from week_remap m
  where rs.start_week = m.old_week
    and m.new_week > 0
    and rs.start_week is distinct from m.new_week
    and not exists (
      select 1 from public.roster_slots other
      where other.league_id = rs.league_id
        and other.manager_id = rs.manager_id
        and other.slot_number = rs.slot_number
        and other.start_week = m.new_week
        and other.id is distinct from rs.id
    );

  update public.roster_slots rs
  set end_week = m.new_week
  from week_remap m
  where rs.end_week = m.old_week
    and m.new_week > 0
    and rs.end_week is distinct from m.new_week;

  update public.waiver_claims wc
  set week_number = m.new_week
  from week_remap m
  where wc.week_number = m.old_week
    and m.new_week > 0
    and wc.week_number is distinct from m.new_week;

  update public.scoring_settings ss
  set judges_score_starts_week = m.new_week
  from week_remap m
  where ss.judges_score_starts_week = m.old_week
    and m.new_week > 0
    and ss.judges_score_starts_week is distinct from m.new_week;

  -- last_watched_week: latest scoring week whose old number they had already passed.
  update public.spoiler_watch_progress swp
  set last_watched_week = coalesce((
        select max(m.new_week)
        from week_remap m
        where m.old_week <= swp.last_watched_week
          and m.new_week > 0
      ), 0)
  where swp.season_id = v_season_id;

  -- Unique (season_id, week_number): bump, then assign finals.
  update public.episodes
  set week_number = week_number + 1000
  where season_id = v_season_id
    and is_scoring;

  update public.episodes e
  set week_number = m.new_week
  from week_remap m
  where e.season_id = v_season_id
    and e.is_scoring
    and e.week_number = m.old_week + 1000;

  raise notice '=== AFTER (%) ===', v_season_name;
  for v_ep in
    select
      e.week_number,
      e.id,
      e.theme,
      e.status,
      e.airs_at,
      e.is_scoring,
      (select count(*) from public.dance_scores ds where ds.episode_id = e.id) as dances,
      (select count(*) from public.episode_results er where er.episode_id = e.id) as results,
      (select count(*) from public.episode_participants ep where ep.episode_id = e.id) as participants
    from public.episodes e
    where e.season_id = v_season_id
    order by e.is_scoring desc, e.week_number
  loop
    raise notice 'week % id=% theme=% status=% scoring=% dances=% results=% participants=% airs_at=%',
      v_ep.week_number, v_ep.id, coalesce(v_ep.theme, '∅'), v_ep.status,
      v_ep.is_scoring, v_ep.dances, v_ep.results, v_ep.participants, v_ep.airs_at;
  end loop;
end $$;

commit;
