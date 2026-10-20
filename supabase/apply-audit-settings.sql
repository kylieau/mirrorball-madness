-- Apply after audit security and deadline migrations. No score rows are recomputed.
begin;
alter table public.scoring_settings add column if not exists revision bigint not null default 0;
create or replace function public.bump_scoring_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - array['revision','grand_finale_deadline_at','grand_finale_deadline_season_id']) is distinct from (to_jsonb(old) - array['revision','grand_finale_deadline_at','grand_finale_deadline_season_id']) then new.revision := old.revision + 1; end if;
  return new;
end;
$$;
drop trigger if exists z_bump_scoring_revision on public.scoring_settings;
create trigger z_bump_scoring_revision before update on public.scoring_settings for each row execute function public.bump_scoring_revision();

create or replace function public.update_scoring_categories_checked(p_league_id uuid,p_expected_revision bigint,p_values jsonb)
returns public.scoring_settings language plpgsql security definer set search_path = '' as $$
declare v_current public.scoring_settings; v_values public.scoring_settings;
begin
  if not public.is_league_commissioner(p_league_id) then raise exception 'Only the commissioner can update scoring settings'; end if;
  select * into strict v_current from public.scoring_settings where league_id=p_league_id for update;
  if p_expected_revision is null or v_current.revision <> p_expected_revision then raise exception 'These settings changed in another tab. Reload before saving.'; end if;
  v_values := jsonb_populate_record(null::public.scoring_settings,p_values);
  return public.update_scoring_categories(
    p_league_id,
    v_values.judges_score_category_enabled,
    v_values.eliminations_category_enabled,
    v_values.bonus_picks_category_enabled,
    v_values.judges_score_category_weight,
    v_values.eliminations_category_weight,
    v_values.bonus_picks_category_weight,
    v_values.judges_score_starts_week,
    v_values.bonus_picks_scoring_method,
    v_values.bonus_picks_distance_penalty,
    v_values.bonus_picks_tier_size,
    v_values.judges_score_multiplier,
    v_values.survival_points,
    v_values.first_place_points,
    v_values.second_place_points,
    v_values.third_place_points,
    v_values.elimination_prediction_points,
    v_values.top_scorer_prediction_points,
    v_values.bonus_picks_points_per_correct,
    v_values.fourth_place_points,
    v_values.fifth_place_points,
    v_values.bonus_picks_tier_pay_style,
    v_values.curtain_call_near_miss_enabled);
end;
$$;
revoke all on function public.update_scoring_categories_checked(uuid,bigint,jsonb) from public,anon;
grant execute on function public.update_scoring_categories_checked(uuid,bigint,jsonb) to authenticated;

revoke execute on function public.update_scoring_categories(uuid,boolean,boolean,boolean,numeric,numeric,numeric,int,text,numeric,int,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,boolean) from authenticated;
commit;
