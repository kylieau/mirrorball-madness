-- Curtain Call In Jeopardy.
--
-- Partial credit when an elimination guess was in the commissioner-marked
-- called-down group, or a top-scorer guess finished within 1 of the week
-- high. Credit is floor(exact payout * 0.25), hardcoded in
-- src/lib/scoring.ts — this column is only the on/off switch (default on).
--
-- Not retroactive: this script does not rewrite weekly_manager_scores.
-- The next Enter Results publish or correction recomputes that week.
--
-- Run once in the Supabase Dashboard SQL Editor, before or at merge. Then
-- regenerate types (the copy in this PR was hand-updated; this environment
-- has no SUPABASE_ACCESS_TOKEN and the live project does not have these
-- tables until this file runs):
--   npx supabase gen types typescript --project-id wssbwgtsejamlbvfofvu --schema public > src/lib/supabase/types.ts

begin;

alter table public.scoring_settings
  add column curtain_call_near_miss_enabled boolean not null default true;

comment on column public.scoring_settings.curtain_call_near_miss_enabled is
  'Curtain Call In Jeopardy switch. On pays floor(exact payout * 0.25) for a marked elimination near-miss or a top scorer within 1 of the week high. Fraction is hardcoded in src/lib/scoring.ts. Locks with the Season Clock. Does not rewrite historical weekly_manager_scores.';

-- Default true backfills every existing league. No score rewrite.

create table public.episode_in_jeopardy_couples (
  episode_id uuid not null references public.episodes(id) on delete cascade,
  couple_id uuid not null references public.couples(id),
  created_at timestamptz not null default now(),
  primary key (episode_id, couple_id)
);

create index idx_episode_in_jeopardy_episode on public.episode_in_jeopardy_couples(episode_id);

grant select on public.episode_in_jeopardy_couples to authenticated;

create policy "episode in jeopardy couples are viewable by all authenticated users"
on public.episode_in_jeopardy_couples for select
using (true);

comment on table public.episode_in_jeopardy_couples is
  'Couples the show called down who were not eliminated. Source of truth for Curtain Call elimination near-miss credit. Not inferred from judges scores.';

create table public.draft_episode_in_jeopardy_couples (
  episode_id uuid not null references public.episodes(id) on delete cascade,
  couple_id uuid not null references public.couples(id),
  created_at timestamptz not null default now(),
  primary key (episode_id, couple_id)
);

create index idx_draft_episode_in_jeopardy_episode on public.draft_episode_in_jeopardy_couples(episode_id);

comment on table public.draft_episode_in_jeopardy_couples is
  'Draft copy of episode_in_jeopardy_couples. No grants — service role only, same as the other draft results tables.';

-- Argument list changed, so replace is not enough.
drop function if exists public.update_scoring_categories(uuid, boolean, boolean, boolean, numeric, numeric, numeric, int, text, numeric, int, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text);

create function public.update_scoring_categories(
  p_league_id uuid,
  p_judges_score_category_enabled boolean,
  p_eliminations_category_enabled boolean,
  p_bonus_picks_category_enabled boolean,
  p_judges_score_category_weight numeric,
  p_eliminations_category_weight numeric,
  p_bonus_picks_category_weight numeric,
  p_judges_score_starts_week int,
  p_bonus_picks_scoring_method text,
  p_bonus_picks_distance_penalty numeric,
  p_bonus_picks_tier_size int,
  p_judges_score_multiplier numeric,
  p_survival_points numeric,
  p_first_place_points numeric,
  p_second_place_points numeric,
  p_third_place_points numeric,
  p_elimination_prediction_points numeric,
  p_top_scorer_prediction_points numeric,
  p_bonus_picks_points_per_correct numeric,
  p_fourth_place_points numeric,
  p_fifth_place_points numeric,
  p_bonus_picks_tier_pay_style text,
  p_curtain_call_near_miss_enabled boolean
)
returns public.scoring_settings
language plpgsql
security definer set search_path = ''
as $$
declare
  v_settings public.scoring_settings;
  v_current public.scoring_settings;
  v_deadline timestamptz;
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Only the commissioner can update scoring categories';
  end if;

  -- Turning Dance Card off mid-draft would make every remaining pick fail
  -- record_draft_pick's Dance Card check and strand the draft.
  if not p_judges_score_category_enabled and exists (
    select 1 from public.leagues
    where id = p_league_id and draft_status = 'in_progress'
  ) then
    raise exception 'Dance Card can''t be turned off while the draft is in progress';
  end if;

  select * into v_current from public.scoring_settings where league_id = p_league_id;
  if not found then
    raise exception 'Scoring settings not found for this league';
  end if;

  -- Everything except judges_score_multiplier locks together the moment the
  -- Season Clock anchor passes (see the comment above scoring_settings) —
  -- one shared trigger, not per category, so a commissioner can never see
  -- one category's real results before finalizing another's weight. A no-op
  -- resave (every value already matches) still succeeds, since the Settings
  -- form always round-trips every field regardless of what actually changed.
  v_deadline := public.effective_grand_finale_deadline(p_league_id);
  if not v_current.locking_exempt and v_deadline is not null and now() >= v_deadline then
    if (
      p_judges_score_category_enabled, p_eliminations_category_enabled, p_bonus_picks_category_enabled,
      p_judges_score_category_weight, p_eliminations_category_weight, p_bonus_picks_category_weight,
      p_judges_score_starts_week, p_bonus_picks_scoring_method, p_bonus_picks_distance_penalty,
      p_bonus_picks_tier_size, p_bonus_picks_tier_pay_style, p_survival_points,
      p_first_place_points, p_second_place_points, p_third_place_points, p_fourth_place_points, p_fifth_place_points,
      p_elimination_prediction_points, p_top_scorer_prediction_points, p_bonus_picks_points_per_correct,
      p_curtain_call_near_miss_enabled
    ) is distinct from (
      v_current.judges_score_category_enabled, v_current.eliminations_category_enabled, v_current.bonus_picks_category_enabled,
      v_current.judges_score_category_weight, v_current.eliminations_category_weight, v_current.bonus_picks_category_weight,
      v_current.judges_score_starts_week, v_current.bonus_picks_scoring_method, v_current.bonus_picks_distance_penalty,
      v_current.bonus_picks_tier_size, v_current.bonus_picks_tier_pay_style, v_current.survival_points,
      v_current.first_place_points, v_current.second_place_points, v_current.third_place_points, v_current.fourth_place_points, v_current.fifth_place_points,
      v_current.elimination_prediction_points, v_current.top_scorer_prediction_points, v_current.bonus_picks_points_per_correct,
      v_current.curtain_call_near_miss_enabled
    ) then
      raise exception 'Scoring settings are locked for the season — the Grand Finale deadline has passed';
    end if;
  end if;

  update public.scoring_settings
  set
    judges_score_category_enabled = p_judges_score_category_enabled,
    eliminations_category_enabled = p_eliminations_category_enabled,
    bonus_picks_category_enabled = p_bonus_picks_category_enabled,
    judges_score_category_weight = p_judges_score_category_weight,
    eliminations_category_weight = p_eliminations_category_weight,
    bonus_picks_category_weight = p_bonus_picks_category_weight,
    judges_score_starts_week = p_judges_score_starts_week,
    bonus_picks_scoring_method = p_bonus_picks_scoring_method,
    bonus_picks_distance_penalty = p_bonus_picks_distance_penalty,
    bonus_picks_tier_size = p_bonus_picks_tier_size,
    bonus_picks_tier_pay_style = p_bonus_picks_tier_pay_style,
    -- Right-hand sides here still see the pre-update row, even though
    -- judges_score_multiplier is also being overwritten in this same
    -- statement — so this correctly flags "did the commissioner just change
    -- it" without a separate select.
    judges_score_multiplier_customized = judges_score_multiplier_customized
      or (judges_score_multiplier is distinct from p_judges_score_multiplier),
    judges_score_multiplier = p_judges_score_multiplier,
    survival_points = p_survival_points,
    first_place_points = p_first_place_points,
    second_place_points = p_second_place_points,
    third_place_points = p_third_place_points,
    fourth_place_points = p_fourth_place_points,
    fifth_place_points = p_fifth_place_points,
    elimination_prediction_points = p_elimination_prediction_points,
    top_scorer_prediction_points = p_top_scorer_prediction_points,
    bonus_picks_points_per_correct = p_bonus_picks_points_per_correct,
    curtain_call_near_miss_enabled = p_curtain_call_near_miss_enabled,
    scoring_configured = true
  where league_id = p_league_id
  returning * into v_settings;

  return v_settings;
end;
$$;

revoke execute on function public.update_scoring_categories(uuid, boolean, boolean, boolean, numeric, numeric, numeric, int, text, numeric, int, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, boolean) from public;
grant execute on function public.update_scoring_categories(uuid, boolean, boolean, boolean, numeric, numeric, numeric, int, text, numeric, int, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, boolean) to authenticated;

commit;
