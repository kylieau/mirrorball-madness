export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      couples: {
        Row: {
          celebrity_id: string
          created_at: string
          elimination_week: number | null
          elimination_week_part: number | null
          id: string
          pro_id: string
          season_id: string
          status: string
        }
        Insert: {
          celebrity_id: string
          created_at?: string
          elimination_week?: number | null
          elimination_week_part?: number | null
          id?: string
          pro_id: string
          season_id: string
          status?: string
        }
        Update: {
          celebrity_id?: string
          created_at?: string
          elimination_week?: number | null
          elimination_week_part?: number | null
          id?: string
          pro_id?: string
          season_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "couples_celebrity_id_fkey"
            columns: ["celebrity_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "couples_pro_id_fkey"
            columns: ["pro_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "couples_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      dance_scores: {
        Row: {
          couple_id: string
          created_at: string
          dance_style_id: string
          episode_id: string
          id: string
          song_title: string | null
          total_score: number
        }
        Insert: {
          couple_id: string
          created_at?: string
          dance_style_id: string
          episode_id: string
          id?: string
          song_title?: string | null
          total_score: number
        }
        Update: {
          couple_id?: string
          created_at?: string
          dance_style_id?: string
          episode_id?: string
          id?: string
          song_title?: string | null
          total_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "dance_scores_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dance_scores_dance_style_id_fkey"
            columns: ["dance_style_id"]
            isOneToOne: false
            referencedRelation: "dance_styles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dance_scores_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      dance_styles: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      draft_dance_scores: {
        Row: {
          couple_id: string
          created_at: string
          dance_style_id: string
          episode_id: string
          id: string
          song_title: string | null
          total_score: number
        }
        Insert: {
          couple_id: string
          created_at?: string
          dance_style_id: string
          episode_id: string
          id?: string
          song_title?: string | null
          total_score?: number
        }
        Update: {
          couple_id?: string
          created_at?: string
          dance_style_id?: string
          episode_id?: string
          id?: string
          song_title?: string | null
          total_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "draft_dance_scores_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_dance_scores_dance_style_id_fkey"
            columns: ["dance_style_id"]
            isOneToOne: false
            referencedRelation: "dance_styles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_dance_scores_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_episode_custom_moments: {
        Row: {
          couple_id: string | null
          created_at: string
          created_by: string | null
          episode_id: string
          id: string
          label: string
        }
        Insert: {
          couple_id?: string | null
          created_at?: string
          created_by?: string | null
          episode_id: string
          id?: string
          label: string
        }
        Update: {
          couple_id?: string | null
          created_at?: string
          created_by?: string | null
          episode_id?: string
          id?: string
          label?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_episode_custom_moments_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_episode_custom_moments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_episode_custom_moments_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_episode_overrides: {
        Row: {
          episode_id: string
          guest_judge_name: string | null
          judges_save_available: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          episode_id: string
          guest_judge_name?: string | null
          judges_save_available?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          episode_id?: string
          guest_judge_name?: string | null
          judges_save_available?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "draft_episode_overrides_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: true
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_episode_overrides_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_episode_results: {
        Row: {
          bonus_note: string | null
          bonus_points: number
          couple_id: string
          episode_id: string
          had_immunity: boolean
          id: string
          outcome: string
          saved_by_judges: boolean
          was_bottom_three: boolean
          was_bottom_two: boolean
          was_team_dance: boolean
        }
        Insert: {
          bonus_note?: string | null
          bonus_points?: number
          couple_id: string
          episode_id: string
          had_immunity?: boolean
          id?: string
          outcome: string
          saved_by_judges?: boolean
          was_bottom_three?: boolean
          was_bottom_two?: boolean
          was_team_dance?: boolean
        }
        Update: {
          bonus_note?: string | null
          bonus_points?: number
          couple_id?: string
          episode_id?: string
          had_immunity?: boolean
          id?: string
          outcome?: string
          saved_by_judges?: boolean
          was_bottom_three?: boolean
          was_bottom_two?: boolean
          was_team_dance?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "draft_episode_results_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_episode_results_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_judge_scores: {
        Row: {
          draft_dance_score_id: string
          id: string
          judge_id: string
          score: number
        }
        Insert: {
          draft_dance_score_id: string
          id?: string
          judge_id: string
          score: number
        }
        Update: {
          draft_dance_score_id?: string
          id?: string
          judge_id?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "draft_judge_scores_draft_dance_score_id_fkey"
            columns: ["draft_dance_score_id"]
            isOneToOne: false
            referencedRelation: "draft_dance_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_judge_scores_judge_id_fkey"
            columns: ["judge_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_picks: {
        Row: {
          couple_id: string
          id: string
          league_id: string
          manager_id: string
          pick_number: number
          picked_at: string
          round: number
        }
        Insert: {
          couple_id: string
          id?: string
          league_id: string
          manager_id: string
          pick_number: number
          picked_at?: string
          round: number
        }
        Update: {
          couple_id?: string
          id?: string
          league_id?: string
          manager_id?: string
          pick_number?: number
          picked_at?: string
          round?: number
        }
        Relationships: [
          {
            foreignKeyName: "draft_picks_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_picks_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_picks_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      episode_custom_moments: {
        Row: {
          couple_id: string | null
          created_at: string
          created_by: string | null
          episode_id: string
          id: string
          label: string
        }
        Insert: {
          couple_id?: string | null
          created_at?: string
          created_by?: string | null
          episode_id: string
          id?: string
          label: string
        }
        Update: {
          couple_id?: string | null
          created_at?: string
          created_by?: string | null
          episode_id?: string
          id?: string
          label?: string
        }
        Relationships: [
          {
            foreignKeyName: "episode_custom_moments_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_custom_moments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_custom_moments_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      episode_results: {
        Row: {
          bonus_note: string | null
          bonus_points: number
          couple_id: string
          episode_id: string
          had_immunity: boolean
          id: string
          outcome: string
          saved_by_judges: boolean
          was_bottom_three: boolean
          was_bottom_two: boolean
          was_team_dance: boolean
        }
        Insert: {
          bonus_note?: string | null
          bonus_points?: number
          couple_id: string
          episode_id: string
          had_immunity?: boolean
          id?: string
          outcome: string
          saved_by_judges?: boolean
          was_bottom_three?: boolean
          was_bottom_two?: boolean
          was_team_dance?: boolean
        }
        Update: {
          bonus_note?: string | null
          bonus_points?: number
          couple_id?: string
          episode_id?: string
          had_immunity?: boolean
          id?: string
          outcome?: string
          saved_by_judges?: boolean
          was_bottom_three?: boolean
          was_bottom_two?: boolean
          was_team_dance?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "episode_results_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_results_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      episodes: {
        Row: {
          airs_at: string
          expected_dance_count: number
          guest_judge_name: string | null
          id: string
          is_elimination_week: boolean
          is_finale: boolean
          judges_save_available: boolean
          results_published_at: string | null
          results_published_by: string | null
          season_id: string
          status: string
          theme: string | null
          week_number: number
          week_part: number
        }
        Insert: {
          airs_at: string
          expected_dance_count?: number
          guest_judge_name?: string | null
          id?: string
          is_elimination_week?: boolean
          is_finale?: boolean
          judges_save_available?: boolean
          results_published_at?: string | null
          results_published_by?: string | null
          season_id: string
          status?: string
          theme?: string | null
          week_number: number
          week_part?: number
        }
        Update: {
          airs_at?: string
          expected_dance_count?: number
          guest_judge_name?: string | null
          id?: string
          is_elimination_week?: boolean
          is_finale?: boolean
          judges_save_available?: boolean
          results_published_at?: string | null
          results_published_by?: string | null
          season_id?: string
          status?: string
          theme?: string | null
          week_number?: number
          week_part?: number
        }
        Relationships: [
          {
            foreignKeyName: "episodes_results_published_by_fkey"
            columns: ["results_published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episodes_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      grand_finale_predictions: {
        Row: {
          couple_id: string
          id: string
          league_id: string
          manager_id: string
          predicted_position: number
          submitted_at: string
        }
        Insert: {
          couple_id: string
          id?: string
          league_id: string
          manager_id: string
          predicted_position: number
          submitted_at?: string
        }
        Update: {
          couple_id?: string
          id?: string
          league_id?: string
          manager_id?: string
          predicted_position?: number
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grand_finale_predictions_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grand_finale_predictions_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grand_finale_predictions_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      judge_scores: {
        Row: {
          dance_score_id: string
          id: string
          judge_id: string
          score: number
        }
        Insert: {
          dance_score_id: string
          id?: string
          judge_id: string
          score: number
        }
        Update: {
          dance_score_id?: string
          id?: string
          judge_id?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "judge_scores_dance_score_id_fkey"
            columns: ["dance_score_id"]
            isOneToOne: false
            referencedRelation: "dance_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_scores_judge_id_fkey"
            columns: ["judge_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      league_members: {
        Row: {
          draft_position: number | null
          id: string
          joined_at: string
          league_id: string
          role: string
          user_id: string
        }
        Insert: {
          draft_position?: number | null
          id?: string
          joined_at?: string
          league_id: string
          role?: string
          user_id: string
        }
        Update: {
          draft_position?: number | null
          id?: string
          joined_at?: string
          league_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_members_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          commissioner_id: string
          created_at: string
          draft_scheduled_at: string | null
          draft_status: string
          draft_type: string
          id: string
          invite_code: string
          name: string
          pick_time_limit_seconds: number
          prediction_lock_hours_before_air: number
          roster_size: number
          waiver_claim_method: string | null
          waiver_mode: string
        }
        Insert: {
          commissioner_id: string
          created_at?: string
          draft_scheduled_at?: string | null
          draft_status?: string
          draft_type?: string
          id?: string
          invite_code: string
          name: string
          pick_time_limit_seconds?: number
          prediction_lock_hours_before_air?: number
          roster_size?: number
          waiver_claim_method?: string | null
          waiver_mode?: string
        }
        Update: {
          commissioner_id?: string
          created_at?: string
          draft_scheduled_at?: string | null
          draft_status?: string
          draft_type?: string
          id?: string
          invite_code?: string
          name?: string
          pick_time_limit_seconds?: number
          prediction_lock_hours_before_air?: number
          roster_size?: number
          waiver_claim_method?: string | null
          waiver_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "leagues_commissioner_id_fkey"
            columns: ["commissioner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          created_at: string
          id: string
          name: string
          photo_url: string | null
          role: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          photo_url?: string | null
          role: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          photo_url?: string | null
          role?: string
        }
        Relationships: []
      }
      predictions: {
        Row: {
          episode_id: string
          id: string
          league_id: string
          manager_id: string
          predicted_eliminated_couple_id: string | null
          predicted_top_scorer_couple_id: string | null
          submitted_at: string
        }
        Insert: {
          episode_id: string
          id?: string
          league_id: string
          manager_id: string
          predicted_eliminated_couple_id?: string | null
          predicted_top_scorer_couple_id?: string | null
          submitted_at?: string
        }
        Update: {
          episode_id?: string
          id?: string
          league_id?: string
          manager_id?: string
          predicted_eliminated_couple_id?: string | null
          predicted_top_scorer_couple_id?: string | null
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "predictions_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_predicted_eliminated_couple_id_fkey"
            columns: ["predicted_eliminated_couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_predicted_top_scorer_couple_id_fkey"
            columns: ["predicted_top_scorer_couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          deletion_requested_at: string | null
          display_name: string
          id: string
          is_super_admin: boolean
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deletion_requested_at?: string | null
          display_name: string
          id: string
          is_super_admin?: boolean
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deletion_requested_at?: string | null
          display_name?: string
          id?: string
          is_super_admin?: boolean
        }
        Relationships: []
      }
      roster_slots: {
        Row: {
          couple_id: string | null
          end_week: number | null
          id: string
          league_id: string
          manager_id: string
          slot_number: number
          source: string
          start_week: number
        }
        Insert: {
          couple_id?: string | null
          end_week?: number | null
          id?: string
          league_id: string
          manager_id: string
          slot_number: number
          source: string
          start_week: number
        }
        Update: {
          couple_id?: string | null
          end_week?: number | null
          id?: string
          league_id?: string
          manager_id?: string
          slot_number?: number
          source?: string
          start_week?: number
        }
        Relationships: [
          {
            foreignKeyName: "roster_slots_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_slots_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_slots_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scoring_settings: {
        Row: {
          bonus_picks_category_enabled: boolean
          bonus_picks_category_weight: number
          bonus_picks_deadline: string | null
          bonus_picks_distance_penalty: number | null
          bonus_picks_points_per_correct: number
          bonus_picks_scoring_method: string | null
          bonus_picks_tier_size: number | null
          elimination_prediction_points: number
          eliminations_category_enabled: boolean
          eliminations_category_weight: number
          first_place_points: number
          judges_score_category_enabled: boolean
          judges_score_category_weight: number
          judges_score_multiplier: number
          judges_score_starts_week: number
          league_id: string
          scoring_configured: boolean
          second_place_points: number
          survival_points: number
          third_place_points: number
          top_scorer_prediction_points: number
        }
        Insert: {
          bonus_picks_category_enabled?: boolean
          bonus_picks_category_weight?: number
          bonus_picks_deadline?: string | null
          bonus_picks_distance_penalty?: number | null
          bonus_picks_points_per_correct?: number
          bonus_picks_scoring_method?: string | null
          bonus_picks_tier_size?: number | null
          elimination_prediction_points?: number
          eliminations_category_enabled?: boolean
          eliminations_category_weight?: number
          first_place_points?: number
          judges_score_category_enabled?: boolean
          judges_score_category_weight?: number
          judges_score_multiplier?: number
          judges_score_starts_week?: number
          league_id: string
          scoring_configured?: boolean
          second_place_points?: number
          survival_points?: number
          third_place_points?: number
          top_scorer_prediction_points?: number
        }
        Update: {
          bonus_picks_category_enabled?: boolean
          bonus_picks_category_weight?: number
          bonus_picks_deadline?: string | null
          bonus_picks_distance_penalty?: number | null
          bonus_picks_points_per_correct?: number
          bonus_picks_scoring_method?: string | null
          bonus_picks_tier_size?: number | null
          elimination_prediction_points?: number
          eliminations_category_enabled?: boolean
          eliminations_category_weight?: number
          first_place_points?: number
          judges_score_category_enabled?: boolean
          judges_score_category_weight?: number
          judges_score_multiplier?: number
          judges_score_starts_week?: number
          league_id?: string
          scoring_configured?: boolean
          second_place_points?: number
          survival_points?: number
          third_place_points?: number
          top_scorer_prediction_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "scoring_settings_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: true
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          created_at: string
          finale_date: string | null
          id: string
          is_active: boolean
          name: string
          premiere_date: string | null
          total_episodes: number | null
        }
        Insert: {
          created_at?: string
          finale_date?: string | null
          id?: string
          is_active?: boolean
          name: string
          premiere_date?: string | null
          total_episodes?: number | null
        }
        Update: {
          created_at?: string
          finale_date?: string | null
          id?: string
          is_active?: boolean
          name?: string
          premiere_date?: string | null
          total_episodes?: number | null
        }
        Relationships: []
      }
      waiver_claims: {
        Row: {
          couple_id: string
          created_at: string
          id: string
          league_id: string
          manager_id: string
          priority_order: number | null
          resolved_at: string | null
          slot_number: number
          status: string
          week_number: number
        }
        Insert: {
          couple_id: string
          created_at?: string
          id?: string
          league_id: string
          manager_id: string
          priority_order?: number | null
          resolved_at?: string | null
          slot_number: number
          status?: string
          week_number: number
        }
        Update: {
          couple_id?: string
          created_at?: string
          id?: string
          league_id?: string
          manager_id?: string
          priority_order?: number | null
          resolved_at?: string | null
          slot_number?: number
          status?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "waiver_claims_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiver_claims_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiver_claims_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_manager_scores: {
        Row: {
          computed_at: string
          episode_id: string
          grand_finale_points: number
          id: string
          league_id: string
          manager_id: string
          prediction_points: number
          roster_points: number
          total_points: number
        }
        Insert: {
          computed_at?: string
          episode_id: string
          grand_finale_points?: number
          id?: string
          league_id: string
          manager_id: string
          prediction_points?: number
          roster_points?: number
          total_points?: number
        }
        Update: {
          computed_at?: string
          episode_id?: string
          grand_finale_points?: number
          id?: string
          league_id?: string
          manager_id?: string
          prediction_points?: number
          roster_points?: number
          total_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_manager_scores_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_manager_scores_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_manager_scores_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      active_season_id: { Args: never; Returns: string }
      approve_waiver_claim: {
        Args: { p_claim_id: string }
        Returns: {
          couple_id: string
          created_at: string
          id: string
          league_id: string
          manager_id: string
          priority_order: number | null
          resolved_at: string | null
          slot_number: number
          status: string
          week_number: number
        }
        SetofOptions: {
          from: "*"
          to: "waiver_claims"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_account_deletion: { Args: never; Returns: undefined }
      create_league: {
        Args: {
          p_curtain_call_enabled?: boolean
          p_dance_card_enabled?: boolean
          p_grand_finale_enabled?: boolean
          p_name: string
        }
        Returns: {
          commissioner_id: string
          created_at: string
          draft_scheduled_at: string | null
          draft_status: string
          draft_type: string
          id: string
          invite_code: string
          name: string
          pick_time_limit_seconds: number
          prediction_lock_hours_before_air: number
          roster_size: number
          waiver_claim_method: string | null
          waiver_mode: string
        }
        SetofOptions: {
          from: "*"
          to: "leagues"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_league: { Args: { p_league_id: string }; Returns: undefined }
      demote_commissioner: {
        Args: { p_league_id: string; p_user_id: string }
        Returns: undefined
      }
      finalize_waiver_claim: {
        Args: { p_claim_id: string }
        Returns: {
          couple_id: string
          created_at: string
          id: string
          league_id: string
          manager_id: string
          priority_order: number | null
          resolved_at: string | null
          slot_number: number
          status: string
          week_number: number
        }
        SetofOptions: {
          from: "*"
          to: "waiver_claims"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_league_commissioner: {
        Args: { p_league_id: string }
        Returns: boolean
      }
      is_league_member: { Args: { p_league_id: string }; Returns: boolean }
      join_league: {
        Args: { p_invite_code: string }
        Returns: {
          commissioner_id: string
          created_at: string
          draft_scheduled_at: string | null
          draft_status: string
          draft_type: string
          id: string
          invite_code: string
          name: string
          pick_time_limit_seconds: number
          prediction_lock_hours_before_air: number
          roster_size: number
          waiver_claim_method: string | null
          waiver_mode: string
        }
        SetofOptions: {
          from: "*"
          to: "leagues"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      leave_league: { Args: { p_league_id: string }; Returns: undefined }
      make_draft_pick: {
        Args: { p_couple_id: string; p_league_id: string }
        Returns: {
          couple_id: string
          id: string
          league_id: string
          manager_id: string
          pick_number: number
          picked_at: string
          round: number
        }
        SetofOptions: {
          from: "*"
          to: "draft_picks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      prediction_lock_at: {
        Args: { p_episode_id: string; p_league_id: string }
        Returns: string
      }
      process_reverse_standings_waivers: {
        Args: { p_league_id: string }
        Returns: undefined
      }
      promote_to_commissioner: {
        Args: { p_league_id: string; p_user_id: string }
        Returns: undefined
      }
      reject_waiver_claim: {
        Args: { p_claim_id: string }
        Returns: {
          couple_id: string
          created_at: string
          id: string
          league_id: string
          manager_id: string
          priority_order: number | null
          resolved_at: string | null
          slot_number: number
          status: string
          week_number: number
        }
        SetofOptions: {
          from: "*"
          to: "waiver_claims"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      remove_league_member: {
        Args: { p_league_id: string; p_user_id: string }
        Returns: undefined
      }
      rename_league: {
        Args: { p_league_id: string; p_name: string }
        Returns: {
          commissioner_id: string
          created_at: string
          draft_scheduled_at: string | null
          draft_status: string
          draft_type: string
          id: string
          invite_code: string
          name: string
          pick_time_limit_seconds: number
          prediction_lock_hours_before_air: number
          roster_size: number
          waiver_claim_method: string | null
          waiver_mode: string
        }
        SetofOptions: {
          from: "*"
          to: "leagues"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_account_deletion: { Args: never; Returns: undefined }
      set_draft_order: {
        Args: { p_league_id: string; p_ordered_user_ids: string[] }
        Returns: undefined
      }
      start_draft: {
        Args: { p_league_id: string }
        Returns: {
          commissioner_id: string
          created_at: string
          draft_scheduled_at: string | null
          draft_status: string
          draft_type: string
          id: string
          invite_code: string
          name: string
          pick_time_limit_seconds: number
          prediction_lock_hours_before_air: number
          roster_size: number
          waiver_claim_method: string | null
          waiver_mode: string
        }
        SetofOptions: {
          from: "*"
          to: "leagues"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_grand_finale_prediction: {
        Args: { p_couple_ids: string[]; p_league_id: string }
        Returns: {
          couple_id: string
          id: string
          league_id: string
          manager_id: string
          predicted_position: number
          submitted_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "grand_finale_predictions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      submit_prediction: {
        Args: {
          p_episode_id: string
          p_league_id: string
          p_predicted_eliminated_couple_id: string
          p_predicted_top_scorer_couple_id: string
        }
        Returns: {
          episode_id: string
          id: string
          league_id: string
          manager_id: string
          predicted_eliminated_couple_id: string | null
          predicted_top_scorer_couple_id: string | null
          submitted_at: string
        }
        SetofOptions: {
          from: "*"
          to: "predictions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_waiver_claim: {
        Args: {
          p_couple_id: string
          p_league_id: string
          p_slot_number: number
        }
        Returns: {
          couple_id: string
          created_at: string
          id: string
          league_id: string
          manager_id: string
          priority_order: number | null
          resolved_at: string | null
          slot_number: number
          status: string
          week_number: number
        }
        SetofOptions: {
          from: "*"
          to: "waiver_claims"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_league_settings: {
        Args: {
          p_draft_scheduled_at: string
          p_draft_type: string
          p_league_id: string
          p_pick_time_limit_seconds: number
          p_prediction_lock_hours_before_air: number
          p_waiver_claim_method: string
          p_waiver_mode: string
        }
        Returns: {
          commissioner_id: string
          created_at: string
          draft_scheduled_at: string | null
          draft_status: string
          draft_type: string
          id: string
          invite_code: string
          name: string
          pick_time_limit_seconds: number
          prediction_lock_hours_before_air: number
          roster_size: number
          waiver_claim_method: string | null
          waiver_mode: string
        }
        SetofOptions: {
          from: "*"
          to: "leagues"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_scoring_categories: {
        Args: {
          p_bonus_picks_category_enabled: boolean
          p_bonus_picks_category_weight: number
          p_bonus_picks_deadline: string
          p_bonus_picks_distance_penalty: number
          p_bonus_picks_points_per_correct: number
          p_bonus_picks_scoring_method: string
          p_bonus_picks_tier_size: number
          p_elimination_prediction_points: number
          p_eliminations_category_enabled: boolean
          p_eliminations_category_weight: number
          p_first_place_points: number
          p_judges_score_category_enabled: boolean
          p_judges_score_category_weight: number
          p_judges_score_multiplier: number
          p_judges_score_starts_week: number
          p_league_id: string
          p_second_place_points: number
          p_survival_points: number
          p_third_place_points: number
          p_top_scorer_prediction_points: number
        }
        Returns: {
          bonus_picks_category_enabled: boolean
          bonus_picks_category_weight: number
          bonus_picks_deadline: string | null
          bonus_picks_distance_penalty: number | null
          bonus_picks_points_per_correct: number
          bonus_picks_scoring_method: string | null
          bonus_picks_tier_size: number | null
          elimination_prediction_points: number
          eliminations_category_enabled: boolean
          eliminations_category_weight: number
          first_place_points: number
          judges_score_category_enabled: boolean
          judges_score_category_weight: number
          judges_score_multiplier: number
          judges_score_starts_week: number
          league_id: string
          scoring_configured: boolean
          second_place_points: number
          survival_points: number
          third_place_points: number
          top_scorer_prediction_points: number
        }
        SetofOptions: {
          from: "*"
          to: "scoring_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
