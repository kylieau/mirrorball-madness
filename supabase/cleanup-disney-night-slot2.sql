-- One-time cleanup of the Disney Night draft that was saved with Dances
-- (Per Couple) = 2 and every couple's second slot holding the team's
-- Freestyle and song with no marks. Run AFTER apply-team-dance-entity.sql,
-- before anything for that night is posted, and only with Kylie's OK
-- (preview and production share one database).
--
-- It seeds the two teams from those blank rows (Zoo -> Slaytopia, We're All
-- in This Together -> Wildcats, anything else named after its song), moves
-- each couple onto its team, deletes the blank rows, and sets Dances (Per
-- Couple) back to 1. Captains and hosts are then added in Schedule's Edit
-- Episode sheet. Rows that already carry marks are left alone.
--
-- Replace <DISNEY> with the episode id, e.g.
--   select id, theme from public.episodes
--   where season_id = public.active_season_id() and theme ilike '%disney%';
begin;

create table if not exists public._backup_20261102_disney_slot2 as
  select d.*, now() as backed_up_at from public.draft_dance_scores d where d.episode_id = '<DISNEY>';

with fs as (
  select id from public.dance_styles where lower(name) = 'freestyle' order by created_at limit 1
),
blank as (
  select d.id, d.couple_id, d.dance_style_id, d.song_title
  from public.draft_dance_scores d, fs
  where d.episode_id = '<DISNEY>' and d.dance_style_id = fs.id
    and not exists (select 1 from public.draft_judge_scores j where j.draft_dance_score_id = d.id)
),
teams as (
  insert into public.episode_teams (episode_id, name, song_title, dance_style_id, sort_order)
  select '<DISNEY>',
         case public.team_song_key(min(song_title))
           when 'zoo' then 'Slaytopia'
           when 'we''re all in this together' then 'Wildcats'
           when 'we’re all in this together' then 'Wildcats'
           else min(song_title) end,
         min(song_title), dance_style_id,
         row_number() over (order by min(song_title))
  from blank
  where song_title is not null
  group by public.team_song_key(song_title), dance_style_id
  on conflict (episode_id, name) do update set updated_at = now()
  returning id, song_title, dance_style_id
)
insert into public.episode_team_members (team_id, episode_id, couple_id)
select t.id, '<DISNEY>', b.couple_id
from blank b
join teams t on public.team_song_key(t.song_title) = public.team_song_key(b.song_title) and t.dance_style_id = b.dance_style_id
on conflict do nothing;

delete from public.draft_dance_scores d
using public.dance_styles fs
where d.episode_id = '<DISNEY>' and fs.id = d.dance_style_id and lower(fs.name) = 'freestyle'
  and not exists (select 1 from public.draft_judge_scores j where j.draft_dance_score_id = d.id);

update public.episodes set expected_dance_count = 1 where id = '<DISNEY>';

commit;

-- Verify:
--   select t.name, t.song_title, (select count(*) from public.episode_team_members m where m.team_id = t.id) as members
--   from public.episode_teams t where t.episode_id = '<DISNEY>' order by t.sort_order;
--   select count(*) as own_dances from public.draft_dance_scores where episode_id = '<DISNEY>';
--   select expected_dance_count from public.episodes where id = '<DISNEY>';
