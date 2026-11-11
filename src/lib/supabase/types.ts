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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      _backup_20260918_grand_finale_predictions: {
        Row: {
          couple_id: string | null
          id: string | null
          league_id: string | null
          manager_id: string | null
          predicted_position: number | null
          submitted_at: string | null
        }
        Insert: {
          couple_id?: string | null
          id?: string | null
          league_id?: string | null
          manager_id?: string | null
          predicted_position?: number | null
          submitted_at?: string | null
        }
        Update: {
          couple_id?: string | null
          id?: string | null
          league_id?: string | null
          manager_id?: string | null
          predicted_position?: number | null
          submitted_at?: string | null
        }
        Relationships: []
      }
      _backup_20260918_predictions: {
        Row: {
          episode_id: string | null
          id: string | null
          league_id: string | null
          manager_id: string | null
          predicted_eliminated_couple_id: string | null
          predicted_eliminated_couple_id_2: string | null
          predicted_top_scorer_couple_id: string | null
          submitted_at: string | null
        }
        Insert: {
          episode_id?: string | null
          id?: string | null
          league_id?: string | null
          manager_id?: string | null
          predicted_eliminated_couple_id?: string | null
          predicted_eliminated_couple_id_2?: string | null
          predicted_top_scorer_couple_id?: string | null
          submitted_at?: string | null
        }
        Update: {
          episode_id?: string | null
          id?: string | null
          league_id?: string | null
          manager_id?: string | null
          predicted_eliminated_couple_id?: string | null
          predicted_eliminated_couple_id_2?: string | null
          predicted_top_scorer_couple_id?: string | null
          submitted_at?: string | null
        }
        Relationships: []
      }
      _backup_20260918_weekly_manager_scores: {
        Row: {
          computed_at: string | null
          episode_id: string | null
          grand_finale_points: number | null
          id: string | null
          league_id: string | null
          manager_id: string | null
          prediction_points: number | null
          roster_points: number | null
          total_points: number | null
        }
        Insert: {
          computed_at?: string | null
          episode_id?: string | null
          grand_finale_points?: number | null
          id?: string | null
          league_id?: string | null
          manager_id?: string | null
          prediction_points?: number | null
          roster_points?: number | null
          total_points?: number | null
        }
        Update: {
          computed_at?: string | null
          episode_id?: string | null
          grand_finale_points?: number | null
          id?: string | null
          league_id?: string | null
          manager_id?: string | null
          prediction_points?: number | null
          roster_points?: number | null
          total_points?: number | null
        }
        Relationships: []
      }
      _backup_20261102_disney_slot2: {
        Row: {
          backed_up_at: string | null
          couple_id: string | null
          created_at: string | null
          dance_style_id: string | null
          episode_id: string | null
          id: string | null
          scaled_score: number | null
          song_title: string | null
          total_score: number | null
        }
        Insert: {
          backed_up_at?: string | null
          couple_id?: string | null
          created_at?: string | null
          dance_style_id?: string | null
          episode_id?: string | null
          id?: string | null
          scaled_score?: number | null
          song_title?: string | null
          total_score?: number | null
        }
        Update: {
          backed_up_at?: string | null
          couple_id?: string | null
          created_at?: string | null
          dance_style_id?: string | null
          episode_id?: string | null
          id?: string | null
          scaled_score?: number | null
          song_title?: string | null
          total_score?: number | null
        }
        Relationships: []
      }
      _backup_20261102_week9_draft_override: {
        Row: {
          correction_base_published_at: string | null
          correction_token: string | null
          episode_id: string | null
          guest_judge_name: string | null
          judges_save_available: boolean | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          correction_base_published_at?: string | null
          correction_token?: string | null
          episode_id?: string | null
          guest_judge_name?: string | null
          judges_save_available?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          correction_base_published_at?: string | null
          correction_token?: string | null
          episode_id?: string | null
          guest_judge_name?: string | null
          judges_save_available?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      _backup_20261103_episode_team_marks: {
        Row: {
          backed_up_at: string | null
          judge_id: string | null
          score: number | null
          team_id: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          backed_up_at?: string | null
          judge_id?: string | null
          score?: number | null
          team_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          backed_up_at?: string | null
          judge_id?: string | null
          score?: number | null
          team_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      _backup_20261103_episode_team_members: {
        Row: {
          backed_up_at: string | null
          couple_id: string | null
          created_at: string | null
          episode_id: string | null
          team_id: string | null
        }
        Insert: {
          backed_up_at?: string | null
          couple_id?: string | null
          created_at?: string | null
          episode_id?: string | null
          team_id?: string | null
        }
        Update: {
          backed_up_at?: string | null
          couple_id?: string | null
          created_at?: string | null
          episode_id?: string | null
          team_id?: string | null
        }
        Relationships: []
      }
      _backup_20261103_episode_teams: {
        Row: {
          backed_up_at: string | null
          captain_couple_id: string | null
          created_at: string | null
          dance_style_id: string | null
          episode_id: string | null
          host_name: string | null
          id: string | null
          name: string | null
          posted_at: string | null
          posted_by: string | null
          song_source: string | null
          song_title: string | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          backed_up_at?: string | null
          captain_couple_id?: string | null
          created_at?: string | null
          dance_style_id?: string | null
          episode_id?: string | null
          host_name?: string | null
          id?: string | null
          name?: string | null
          posted_at?: string | null
          posted_by?: string | null
          song_source?: string | null
          song_title?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          backed_up_at?: string | null
          captain_couple_id?: string | null
          created_at?: string | null
          dance_style_id?: string | null
          episode_id?: string | null
          host_name?: string | null
          id?: string | null
          name?: string | null
          posted_at?: string | null
          posted_by?: string | null
          song_source?: string | null
          song_title?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      competition_weeks: {
        Row: {
          id: string
          is_double_elimination_week: boolean
          is_elimination_week: boolean
          is_finale: boolean
          season_id: string
          theme: string | null
          week_number: number
        }
        Insert: {
          id?: string
          is_double_elimination_week?: boolean
          is_elimination_week?: boolean
          is_finale?: boolean
          season_id: string
          theme?: string | null
          week_number: number
        }
        Update: {
          id?: string
          is_double_elimination_week?: boolean
          is_elimination_week?: boolean
          is_finale?: boolean
          season_id?: string
          theme?: string | null
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "competition_weeks_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      couples: {
        Row: {
          celebrity_id: string
          created_at: string
          elimination_week: number | null
          id: string
          pro_id: string
          season_id: string
          status: string
        }
        Insert: {
          celebrity_id: string
          created_at?: string
          elimination_week?: number | null
          id?: string
          pro_id: string
          season_id: string
          status?: string
        }
        Update: {
          celebrity_id?: string
          created_at?: string
          elimination_week?: number | null
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
      dance_card_calibration: {
        Row: {
          judges_score_multiplier_default: number
          roster_size: number
        }
        Insert: {
          judges_score_multiplier_default: number
          roster_size: number
        }
        Update: {
          judges_score_multiplier_default?: number
          roster_size?: number
        }
        Relationships: []
      }
      dance_scores: {
        Row: {
          couple_id: string
          created_at: string
          dance_style_id: string
          episode_id: string
          id: string
          max_score: number | null
          scaled_score: number
          song_title: string | null
          team_id: string | null
          total_score: number
        }
        Insert: {
          couple_id: string
          created_at?: string
          dance_style_id: string
          episode_id: string
          id?: string
          max_score?: number | null
          scaled_score?: number
          song_title?: string | null
          team_id?: string | null
          total_score: number
        }
        Update: {
          couple_id?: string
          created_at?: string
          dance_style_id?: string
          episode_id?: string
          id?: string
          max_score?: number | null
          scaled_score?: number
          song_title?: string | null
          team_id?: string | null
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
          {
            foreignKeyName: "dance_scores_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "episode_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      dance_styles: {
        Row: {
          category: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      draft_couple_releases: {
        Row: {
          couple_id: string
          episode_id: string
          released_at: string
          released_by: string
        }
        Insert: {
          couple_id: string
          episode_id: string
          released_at?: string
          released_by: string
        }
        Update: {
          couple_id?: string
          episode_id?: string
          released_at?: string
          released_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_couple_releases_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_couple_releases_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_couple_releases_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_dance_scores: {
        Row: {
          couple_id: string
          created_at: string
          dance_style_id: string
          episode_id: string
          id: string
          scaled_score: number
          song_title: string | null
          total_score: number
        }
        Insert: {
          couple_id: string
          created_at?: string
          dance_style_id: string
          episode_id: string
          id?: string
          scaled_score?: number
          song_title?: string | null
          total_score?: number
        }
        Update: {
          couple_id?: string
          created_at?: string
          dance_style_id?: string
          episode_id?: string
          id?: string
          scaled_score?: number
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
      draft_episode_in_jeopardy_couples: {
        Row: {
          couple_id: string
          created_at: string
          episode_id: string
        }
        Insert: {
          couple_id: string
          created_at?: string
          episode_id: string
        }
        Update: {
          couple_id?: string
          created_at?: string
          episode_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_episode_in_jeopardy_couples_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_episode_in_jeopardy_couples_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_episode_overrides: {
        Row: {
          correction_base_published_at: string | null
          correction_token: string | null
          episode_id: string
          guest_judge_name: string | null
          judges_save_available: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          correction_base_published_at?: string | null
          correction_token?: string | null
          episode_id: string
          guest_judge_name?: string | null
          judges_save_available?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          correction_base_published_at?: string | null
          correction_token?: string | null
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
          auto_source: string | null
          couple_id: string
          id: string
          is_auto: boolean
          league_id: string
          manager_id: string
          pick_number: number
          picked_at: string
          round: number
        }
        Insert: {
          auto_source?: string | null
          couple_id: string
          id?: string
          is_auto?: boolean
          league_id: string
          manager_id: string
          pick_number: number
          picked_at?: string
          round: number
        }
        Update: {
          auto_source?: string | null
          couple_id?: string
          id?: string
          is_auto?: boolean
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
      draft_queues: {
        Row: {
          couple_ids: string[]
          league_id: string
          user_id: string
        }
        Insert: {
          couple_ids?: string[]
          league_id: string
          user_id: string
        }
        Update: {
          couple_ids?: string[]
          league_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_queues_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_queues_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_special_releases: {
        Row: {
          episode_id: string
          released_at: string
          released_by: string | null
          team_id: string
        }
        Insert: {
          episode_id: string
          released_at?: string
          released_by?: string | null
          team_id: string
        }
        Update: {
          episode_id?: string
          released_at?: string
          released_by?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_special_releases_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_special_releases_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_special_releases_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "episode_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      episode_guest_judges: {
        Row: {
          created_at: string
          episode_id: string
          judge_id: string
        }
        Insert: {
          created_at?: string
          episode_id: string
          judge_id: string
        }
        Update: {
          created_at?: string
          episode_id?: string
          judge_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "episode_guest_judges_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_guest_judges_judge_id_fkey"
            columns: ["judge_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      episode_in_jeopardy_couples: {
        Row: {
          couple_id: string
          created_at: string
          episode_id: string
        }
        Insert: {
          couple_id: string
          created_at?: string
          episode_id: string
        }
        Update: {
          couple_id?: string
          created_at?: string
          episode_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "episode_in_jeopardy_couples_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_in_jeopardy_couples_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      episode_participants: {
        Row: {
          couple_id: string
          created_at: string
          episode_id: string
        }
        Insert: {
          couple_id: string
          created_at?: string
          episode_id: string
        }
        Update: {
          couple_id?: string
          created_at?: string
          episode_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "episode_participants_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_participants_episode_id_fkey"
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
      episode_round_exceptions: {
        Row: {
          bonus_points: number | null
          couple_id: string
          created_at: string
          created_by: string | null
          episode_id: string
          id: string
          kind: string
          note: string | null
          round_id: string
          updated_at: string
        }
        Insert: {
          bonus_points?: number | null
          couple_id: string
          created_at?: string
          created_by?: string | null
          episode_id: string
          id?: string
          kind: string
          note?: string | null
          round_id: string
          updated_at?: string
        }
        Update: {
          bonus_points?: number | null
          couple_id?: string
          created_at?: string
          created_by?: string | null
          episode_id?: string
          id?: string
          kind?: string
          note?: string | null
          round_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "episode_round_exceptions_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_round_exceptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_round_exceptions_round_id_episode_id_fkey"
            columns: ["round_id", "episode_id"]
            isOneToOne: false
            referencedRelation: "episode_rounds"
            referencedColumns: ["id", "episode_id"]
          },
        ]
      }
      episode_round_types: {
        Row: {
          created_at: string
          episode_id: string
          round_type_id: string
        }
        Insert: {
          created_at?: string
          episode_id: string
          round_type_id: string
        }
        Update: {
          created_at?: string
          episode_id?: string
          round_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "episode_round_types_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_round_types_round_type_id_fkey"
            columns: ["round_type_id"]
            isOneToOne: false
            referencedRelation: "round_types"
            referencedColumns: ["id"]
          },
        ]
      }
      episode_rounds: {
        Row: {
          bonus_points: number | null
          created_at: string
          episode_id: string
          id: string
          kind: string
          position: number
          round_type: string
          scoring: string
          unit_count: number
          updated_at: string
        }
        Insert: {
          bonus_points?: number | null
          created_at?: string
          episode_id: string
          id?: string
          kind: string
          position: number
          round_type: string
          scoring: string
          unit_count?: number
          updated_at?: string
        }
        Update: {
          bonus_points?: number | null
          created_at?: string
          episode_id?: string
          id?: string
          kind?: string
          position?: number
          round_type?: string
          scoring?: string
          unit_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "episode_rounds_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      episode_team_couple_marks: {
        Row: {
          couple_id: string
          judge_id: string
          score: number
          team_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          couple_id: string
          judge_id: string
          score: number
          team_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          couple_id?: string
          judge_id?: string
          score?: number
          team_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "episode_team_couple_marks_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_team_couple_marks_judge_id_fkey"
            columns: ["judge_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_team_couple_marks_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "episode_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_team_couple_marks_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      episode_team_marks: {
        Row: {
          judge_id: string
          score: number
          team_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          judge_id: string
          score: number
          team_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          judge_id?: string
          score?: number
          team_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "episode_team_marks_judge_id_fkey"
            columns: ["judge_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_team_marks_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "episode_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_team_marks_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      episode_team_members: {
        Row: {
          couple_id: string
          created_at: string
          episode_id: string
          sort_order: number
          team_id: string
        }
        Insert: {
          couple_id: string
          created_at?: string
          episode_id: string
          sort_order?: number
          team_id: string
        }
        Update: {
          couple_id?: string
          created_at?: string
          episode_id?: string
          sort_order?: number
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "episode_team_members_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_team_members_team_id_episode_id_fkey"
            columns: ["team_id", "episode_id"]
            isOneToOne: false
            referencedRelation: "episode_teams"
            referencedColumns: ["id", "episode_id"]
          },
        ]
      }
      episode_team_scores: {
        Row: {
          couple_id: string
          points: number | null
          result: string | null
          team_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          couple_id: string
          points?: number | null
          result?: string | null
          team_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          couple_id?: string
          points?: number | null
          result?: string | null
          team_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "episode_team_scores_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_team_scores_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "episode_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_team_scores_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      episode_teams: {
        Row: {
          captain_couple_id: string | null
          created_at: string
          dance_style_id: string
          dance_type: string
          details: Json
          episode_id: string
          heat_number: number | null
          host_name: string | null
          id: string
          name: string
          name_is_auto: boolean
          posted_at: string | null
          posted_by: string | null
          round_id: string | null
          scoring_mode: string
          second_dance_style_id: string | null
          song_title: string | null
          songs: Json
          sort_order: number
          updated_at: string
        }
        Insert: {
          captain_couple_id?: string | null
          created_at?: string
          dance_style_id: string
          dance_type?: string
          details?: Json
          episode_id: string
          heat_number?: number | null
          host_name?: string | null
          id?: string
          name: string
          name_is_auto?: boolean
          posted_at?: string | null
          posted_by?: string | null
          round_id?: string | null
          scoring_mode?: string
          second_dance_style_id?: string | null
          song_title?: string | null
          songs?: Json
          sort_order?: number
          updated_at?: string
        }
        Update: {
          captain_couple_id?: string | null
          created_at?: string
          dance_style_id?: string
          dance_type?: string
          details?: Json
          episode_id?: string
          heat_number?: number | null
          host_name?: string | null
          id?: string
          name?: string
          name_is_auto?: boolean
          posted_at?: string | null
          posted_by?: string | null
          round_id?: string | null
          scoring_mode?: string
          second_dance_style_id?: string | null
          song_title?: string | null
          songs?: Json
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "episode_teams_captain_couple_id_fkey"
            columns: ["captain_couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_teams_dance_style_id_fkey"
            columns: ["dance_style_id"]
            isOneToOne: false
            referencedRelation: "dance_styles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_teams_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_teams_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_teams_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "episode_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_teams_second_dance_style_id_fkey"
            columns: ["second_dance_style_id"]
            isOneToOne: false
            referencedRelation: "dance_styles"
            referencedColumns: ["id"]
          },
        ]
      }
      episodes: {
        Row: {
          airs_at: string
          duration_minutes: number
          episode_number: number
          expected_dance_count: number
          guest_judge_name: string | null
          id: string
          judges_save_available: boolean
          results_published_at: string | null
          results_published_by: string | null
          season_id: string
          status: string
          theme: string | null
          week_id: string | null
        }
        Insert: {
          airs_at: string
          duration_minutes?: number
          episode_number: number
          expected_dance_count?: number
          guest_judge_name?: string | null
          id?: string
          judges_save_available?: boolean
          results_published_at?: string | null
          results_published_by?: string | null
          season_id: string
          status?: string
          theme?: string | null
          week_id?: string | null
        }
        Update: {
          airs_at?: string
          duration_minutes?: number
          episode_number?: number
          expected_dance_count?: number
          guest_judge_name?: string | null
          id?: string
          judges_save_available?: boolean
          results_published_at?: string | null
          results_published_by?: string | null
          season_id?: string
          status?: string
          theme?: string | null
          week_id?: string | null
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
          {
            foreignKeyName: "episodes_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "competition_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      grand_finale_late_unlocks: {
        Row: {
          ineligible_couple_ids: string[]
          late_factor: number
          league_id: string
          manager_id: string
          submitted_at: string | null
          unlocked_at: string
          unlocked_by: string
        }
        Insert: {
          ineligible_couple_ids?: string[]
          late_factor?: number
          league_id: string
          manager_id: string
          submitted_at?: string | null
          unlocked_at?: string
          unlocked_by: string
        }
        Update: {
          ineligible_couple_ids?: string[]
          late_factor?: number
          league_id?: string
          manager_id?: string
          submitted_at?: string | null
          unlocked_at?: string
          unlocked_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "grand_finale_late_unlocks_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grand_finale_late_unlocks_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grand_finale_late_unlocks_unlocked_by_fkey"
            columns: ["unlocked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          co_manager_id: string | null
          co_manager_invite_code: string | null
          co_manager_invite_expires_at: string | null
          draft_autopilot: boolean
          draft_position: number | null
          id: string
          joined_at: string
          league_id: string
          role: string
          user_id: string
        }
        Insert: {
          co_manager_id?: string | null
          co_manager_invite_code?: string | null
          co_manager_invite_expires_at?: string | null
          draft_autopilot?: boolean
          draft_position?: number | null
          id?: string
          joined_at?: string
          league_id: string
          role?: string
          user_id: string
        }
        Update: {
          co_manager_id?: string | null
          co_manager_invite_code?: string | null
          co_manager_invite_expires_at?: string | null
          draft_autopilot?: boolean
          draft_position?: number | null
          id?: string
          joined_at?: string
          league_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_members_co_manager_id_fkey"
            columns: ["co_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
      league_point_adjustments: {
        Row: {
          created_at: string
          created_by: string | null
          detail: Json
          id: string
          kind: string
          league_id: string
          manager_id: string
          points: number
          source_id: string | null
          week_id: string
          weighted_points: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          detail?: Json
          id?: string
          kind: string
          league_id: string
          manager_id: string
          points: number
          source_id?: string | null
          week_id: string
          weighted_points: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          detail?: Json
          id?: string
          kind?: string
          league_id?: string
          manager_id?: string
          points?: number
          source_id?: string | null
          week_id?: string
          weighted_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "league_point_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_point_adjustments_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_point_adjustments_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_point_adjustments_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "competition_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          commissioner_id: string
          created_at: string
          current_turn_started_at: string | null
          custom_pick_order: string[] | null
          draft_scheduled_at: string | null
          draft_status: string
          draft_type: string
          id: string
          invite_code: string
          lifeline_enabled: boolean
          lifeline_starts_week: number | null
          name: string
          pick_time_limit_seconds: number
          prediction_lock_coast: string
          prediction_lock_hours_before_air: number
          recast_on_since: string | null
          roster_size: number
          trades_enabled: boolean
          trades_on_since: string | null
          waiver_claim_method: string | null
          waiver_mode: string
        }
        Insert: {
          commissioner_id: string
          created_at?: string
          current_turn_started_at?: string | null
          custom_pick_order?: string[] | null
          draft_scheduled_at?: string | null
          draft_status?: string
          draft_type?: string
          id?: string
          invite_code: string
          lifeline_enabled?: boolean
          lifeline_starts_week?: number | null
          name: string
          pick_time_limit_seconds?: number
          prediction_lock_coast?: string
          prediction_lock_hours_before_air?: number
          recast_on_since?: string | null
          roster_size?: number
          trades_enabled?: boolean
          trades_on_since?: string | null
          waiver_claim_method?: string | null
          waiver_mode?: string
        }
        Update: {
          commissioner_id?: string
          created_at?: string
          current_turn_started_at?: string | null
          custom_pick_order?: string[] | null
          draft_scheduled_at?: string | null
          draft_status?: string
          draft_type?: string
          id?: string
          invite_code?: string
          lifeline_enabled?: boolean
          lifeline_starts_week?: number | null
          name?: string
          pick_time_limit_seconds?: number
          prediction_lock_coast?: string
          prediction_lock_hours_before_air?: number
          recast_on_since?: string | null
          roster_size?: number
          trades_enabled?: boolean
          trades_on_since?: string | null
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
      lifeline_payouts: {
        Row: {
          computed_at: string
          couple_id: string
          credit: number
          league_id: string
          manager_id: string
          points: number
          slot_number: number
          survived: boolean
          week_id: string
          weighted_points: number
        }
        Insert: {
          computed_at?: string
          couple_id: string
          credit: number
          league_id: string
          manager_id: string
          points: number
          slot_number: number
          survived: boolean
          week_id: string
          weighted_points: number
        }
        Update: {
          computed_at?: string
          couple_id?: string
          credit?: number
          league_id?: string
          manager_id?: string
          points?: number
          slot_number?: number
          survived?: boolean
          week_id?: string
          weighted_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "lifeline_payouts_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lifeline_payouts_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lifeline_payouts_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lifeline_payouts_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "competition_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      lifeline_picks: {
        Row: {
          couple_id: string
          id: string
          league_id: string
          manager_id: string
          picked_by: string
          slot_number: number
          updated_at: string
          week_id: string
        }
        Insert: {
          couple_id: string
          id?: string
          league_id: string
          manager_id: string
          picked_by: string
          slot_number: number
          updated_at?: string
          week_id: string
        }
        Update: {
          couple_id?: string
          id?: string
          league_id?: string
          manager_id?: string
          picked_by?: string
          slot_number?: number
          updated_at?: string
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lifeline_picks_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lifeline_picks_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lifeline_picks_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lifeline_picks_picked_by_fkey"
            columns: ["picked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lifeline_picks_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "competition_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          name: string
          photo_url: string | null
          role: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name: string
          photo_url?: string | null
          role: string
        }
        Update: {
          archived_at?: string | null
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
          entered_by: string | null
          entered_via: string | null
          entry_reason: string | null
          id: string
          league_id: string
          manager_id: string
          pick_made_at: string | null
          predicted_eliminated_couple_id: string | null
          predicted_eliminated_couple_id_2: string | null
          predicted_runner_up_couple_id: string | null
          predicted_third_place_couple_id: string | null
          predicted_top_scorer_couple_id: string | null
          predicted_winner_couple_id: string | null
          submitted_at: string
          week_id: string
        }
        Insert: {
          entered_by?: string | null
          entered_via?: string | null
          entry_reason?: string | null
          id?: string
          league_id: string
          manager_id: string
          pick_made_at?: string | null
          predicted_eliminated_couple_id?: string | null
          predicted_eliminated_couple_id_2?: string | null
          predicted_runner_up_couple_id?: string | null
          predicted_third_place_couple_id?: string | null
          predicted_top_scorer_couple_id?: string | null
          predicted_winner_couple_id?: string | null
          submitted_at?: string
          week_id: string
        }
        Update: {
          entered_by?: string | null
          entered_via?: string | null
          entry_reason?: string | null
          id?: string
          league_id?: string
          manager_id?: string
          pick_made_at?: string | null
          predicted_eliminated_couple_id?: string | null
          predicted_eliminated_couple_id_2?: string | null
          predicted_runner_up_couple_id?: string | null
          predicted_third_place_couple_id?: string | null
          predicted_top_scorer_couple_id?: string | null
          predicted_winner_couple_id?: string | null
          submitted_at?: string
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "predictions_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            foreignKeyName: "predictions_predicted_eliminated_couple_id_2_fkey"
            columns: ["predicted_eliminated_couple_id_2"]
            isOneToOne: false
            referencedRelation: "couples"
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
            foreignKeyName: "predictions_predicted_runner_up_couple_id_fkey"
            columns: ["predicted_runner_up_couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_predicted_third_place_couple_id_fkey"
            columns: ["predicted_third_place_couple_id"]
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
          {
            foreignKeyName: "predictions_predicted_winner_couple_id_fkey"
            columns: ["predicted_winner_couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "competition_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          can_propose_results: boolean
          created_at: string
          deletion_requested_at: string | null
          display_name: string
          id: string
          is_super_admin: boolean
          spoiler_free_mode: boolean
        }
        Insert: {
          avatar_url?: string | null
          can_propose_results?: boolean
          created_at?: string
          deletion_requested_at?: string | null
          display_name: string
          id: string
          is_super_admin?: boolean
          spoiler_free_mode?: boolean
        }
        Update: {
          avatar_url?: string | null
          can_propose_results?: boolean
          created_at?: string
          deletion_requested_at?: string | null
          display_name?: string
          id?: string
          is_super_admin?: boolean
          spoiler_free_mode?: boolean
        }
        Relationships: []
      }
      recast_cycles: {
        Row: {
          awards: number
          league_id: string
          processed_at: string
          start_week: number
          trades: number
          week_id: string
          week_number: number
        }
        Insert: {
          awards?: number
          league_id: string
          processed_at?: string
          start_week: number
          trades?: number
          week_id: string
          week_number: number
        }
        Update: {
          awards?: number
          league_id?: string
          processed_at?: string
          start_week?: number
          trades?: number
          week_id?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "recast_cycles_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recast_cycles_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "competition_weeks"
            referencedColumns: ["id"]
          },
        ]
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
      round_types: {
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
      scoring_settings: {
        Row: {
          bonus_picks_category_enabled: boolean
          bonus_picks_category_weight: number
          bonus_picks_distance_penalty: number | null
          bonus_picks_points_per_correct: number
          bonus_picks_scoring_method: string | null
          bonus_picks_tier_pay_style: string
          bonus_picks_tier_size: number | null
          curtain_call_near_miss_enabled: boolean
          dance_card_version: string
          elimination_prediction_points: number
          eliminations_category_enabled: boolean
          eliminations_category_weight: number
          fifth_place_points: number
          first_place_points: number
          fourth_place_points: number
          grand_finale_deadline_at: string | null
          grand_finale_deadline_season_id: string | null
          judges_score_category_enabled: boolean
          judges_score_category_weight: number
          judges_score_multiplier: number
          judges_score_multiplier_customized: boolean
          judges_score_starts_week: number
          league_id: string
          locking_exempt: boolean
          revision: number
          scoring_configured: boolean
          second_place_points: number
          survival_points: number
          third_place_points: number
          top_scorer_prediction_points: number
        }
        Insert: {
          bonus_picks_category_enabled?: boolean
          bonus_picks_category_weight?: number
          bonus_picks_distance_penalty?: number | null
          bonus_picks_points_per_correct?: number
          bonus_picks_scoring_method?: string | null
          bonus_picks_tier_pay_style?: string
          bonus_picks_tier_size?: number | null
          curtain_call_near_miss_enabled?: boolean
          dance_card_version?: string
          elimination_prediction_points?: number
          eliminations_category_enabled?: boolean
          eliminations_category_weight?: number
          fifth_place_points?: number
          first_place_points?: number
          fourth_place_points?: number
          grand_finale_deadline_at?: string | null
          grand_finale_deadline_season_id?: string | null
          judges_score_category_enabled?: boolean
          judges_score_category_weight?: number
          judges_score_multiplier?: number
          judges_score_multiplier_customized?: boolean
          judges_score_starts_week?: number
          league_id: string
          locking_exempt?: boolean
          revision?: number
          scoring_configured?: boolean
          second_place_points?: number
          survival_points?: number
          third_place_points?: number
          top_scorer_prediction_points?: number
        }
        Update: {
          bonus_picks_category_enabled?: boolean
          bonus_picks_category_weight?: number
          bonus_picks_distance_penalty?: number | null
          bonus_picks_points_per_correct?: number
          bonus_picks_scoring_method?: string | null
          bonus_picks_tier_pay_style?: string
          bonus_picks_tier_size?: number | null
          curtain_call_near_miss_enabled?: boolean
          dance_card_version?: string
          elimination_prediction_points?: number
          eliminations_category_enabled?: boolean
          eliminations_category_weight?: number
          fifth_place_points?: number
          first_place_points?: number
          fourth_place_points?: number
          grand_finale_deadline_at?: string | null
          grand_finale_deadline_season_id?: string | null
          judges_score_category_enabled?: boolean
          judges_score_category_weight?: number
          judges_score_multiplier?: number
          judges_score_multiplier_customized?: boolean
          judges_score_starts_week?: number
          league_id?: string
          locking_exempt?: boolean
          revision?: number
          scoring_configured?: boolean
          second_place_points?: number
          survival_points?: number
          third_place_points?: number
          top_scorer_prediction_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "scoring_settings_grand_finale_deadline_season_id_fkey"
            columns: ["grand_finale_deadline_season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
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
          season_number: number | null
          total_episodes: number | null
        }
        Insert: {
          created_at?: string
          finale_date?: string | null
          id?: string
          is_active?: boolean
          name: string
          premiere_date?: string | null
          season_number?: number | null
          total_episodes?: number | null
        }
        Update: {
          created_at?: string
          finale_date?: string | null
          id?: string
          is_active?: boolean
          name?: string
          premiere_date?: string | null
          season_number?: number | null
          total_episodes?: number | null
        }
        Relationships: []
      }
      spoiler_watch_progress: {
        Row: {
          draft_unlocked_week: number
          last_watched_week: number
          season_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          draft_unlocked_week?: number
          last_watched_week?: number
          season_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          draft_unlocked_week?: number
          last_watched_week?: number
          season_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spoiler_watch_progress_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spoiler_watch_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_legs: {
        Row: {
          couple_id: string | null
          from_manager_id: string
          id: string
          leg_order: number
          points: number | null
          to_manager_id: string
          trade_id: string
        }
        Insert: {
          couple_id?: string | null
          from_manager_id: string
          id?: string
          leg_order: number
          points?: number | null
          to_manager_id: string
          trade_id: string
        }
        Update: {
          couple_id?: string | null
          from_manager_id?: string
          id?: string
          leg_order?: number
          points?: number | null
          to_manager_id?: string
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_legs_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_legs_from_manager_id_fkey"
            columns: ["from_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_legs_to_manager_id_fkey"
            columns: ["to_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_legs_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trade_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_offers: {
        Row: {
          accepted_at: string | null
          created_at: string
          expires_at: string
          id: string
          league_id: string
          proposed_by: string
          resolved_at: string | null
          result: string | null
          start_week: number | null
          status: string
          submitted_by: string
          veto_ends_at: string | null
          week_number: number | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          league_id: string
          proposed_by: string
          resolved_at?: string | null
          result?: string | null
          start_week?: number | null
          status?: string
          submitted_by: string
          veto_ends_at?: string | null
          week_number?: number | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          league_id?: string
          proposed_by?: string
          resolved_at?: string | null
          result?: string | null
          start_week?: number | null
          status?: string
          submitted_by?: string
          veto_ends_at?: string | null
          week_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "trade_offers_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_offers_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_offers_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_parties: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          manager_id: string
          trade_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          manager_id: string
          trade_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          manager_id?: string
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_parties_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_parties_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_parties_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trade_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_votes: {
        Row: {
          created_at: string
          manager_id: string
          trade_id: string
          voted_by: string
        }
        Insert: {
          created_at?: string
          manager_id: string
          trade_id: string
          voted_by: string
        }
        Update: {
          created_at?: string
          manager_id?: string
          trade_id?: string
          voted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_votes_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_votes_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trade_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_votes_voted_by_fkey"
            columns: ["voted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      waiver_claims: {
        Row: {
          couple_id: string
          created_at: string
          drop_couple_id: string | null
          id: string
          league_id: string
          manager_id: string
          priority_order: number | null
          resolved_at: string | null
          result: string | null
          slot_number: number
          start_week: number | null
          status: string
          submitted_by: string | null
          week_number: number
        }
        Insert: {
          couple_id: string
          created_at?: string
          drop_couple_id?: string | null
          id?: string
          league_id: string
          manager_id: string
          priority_order?: number | null
          resolved_at?: string | null
          result?: string | null
          slot_number: number
          start_week?: number | null
          status?: string
          submitted_by?: string | null
          week_number: number
        }
        Update: {
          couple_id?: string
          created_at?: string
          drop_couple_id?: string | null
          id?: string
          league_id?: string
          manager_id?: string
          priority_order?: number | null
          resolved_at?: string | null
          result?: string | null
          slot_number?: number
          start_week?: number | null
          status?: string
          submitted_by?: string | null
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
            foreignKeyName: "waiver_claims_drop_couple_id_fkey"
            columns: ["drop_couple_id"]
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
          {
            foreignKeyName: "waiver_claims_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_manager_scores: {
        Row: {
          computed_at: string
          grand_finale_points: number
          id: string
          league_id: string
          manager_id: string
          prediction_points: number
          roster_points: number
          total_points: number
          week_id: string
        }
        Insert: {
          computed_at?: string
          grand_finale_points?: number
          id?: string
          league_id: string
          manager_id: string
          prediction_points?: number
          roster_points?: number
          total_points?: number
          week_id: string
        }
        Update: {
          computed_at?: string
          grand_finale_points?: number
          id?: string
          league_id?: string
          manager_id?: string
          prediction_points?: number
          roster_points?: number
          total_points?: number
          week_id?: string
        }
        Relationships: [
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
          {
            foreignKeyName: "weekly_manager_scores_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "competition_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_manager_scores_archive: {
        Row: {
          archived_at: string
          dance_card_version: string
          grand_finale_points: number
          league_id: string
          manager_id: string
          migration_id: string
          prediction_points: number
          roster_points: number
          total_points: number
          week_id: string
        }
        Insert: {
          archived_at?: string
          dance_card_version: string
          grand_finale_points: number
          league_id: string
          manager_id: string
          migration_id: string
          prediction_points: number
          roster_points: number
          total_points: number
          week_id: string
        }
        Update: {
          archived_at?: string
          dance_card_version?: string
          grand_finale_points?: number
          league_id?: string
          manager_id?: string
          migration_id?: string
          prediction_points?: number
          roster_points?: number
          total_points?: number
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_manager_scores_archive_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_manager_scores_archive_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_manager_scores_archive_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "competition_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      weekly_manager_standings: {
        Row: {
          grand_finale_points: number | null
          league_id: string | null
          lifeline_points: number | null
          manager_id: string | null
          prediction_points: number | null
          roster_points: number | null
          total_points: number | null
          transfer_points: number | null
          week_id: string | null
        }
        Relationships: [
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
          {
            foreignKeyName: "weekly_manager_scores_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "competition_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      active_season_id: { Args: never; Returns: string }
      admin_backfill_podium_prediction: {
        Args: {
          p_league_id: string
          p_manager_id: string
          p_pick_made_at: string
          p_reason: string
          p_runner_up: string
          p_third: string
          p_top_scorer: string
          p_week_id: string
          p_winner: string
        }
        Returns: {
          entered_by: string | null
          entered_via: string | null
          entry_reason: string | null
          id: string
          league_id: string
          manager_id: string
          pick_made_at: string | null
          predicted_eliminated_couple_id: string | null
          predicted_eliminated_couple_id_2: string | null
          predicted_runner_up_couple_id: string | null
          predicted_third_place_couple_id: string | null
          predicted_top_scorer_couple_id: string | null
          predicted_winner_couple_id: string | null
          submitted_at: string
          week_id: string
        }
        SetofOptions: {
          from: "*"
          to: "predictions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_backfill_prediction: {
        Args: {
          p_elimination: string
          p_elimination_2: string
          p_league_id: string
          p_manager_id: string
          p_pick_made_at: string
          p_reason: string
          p_top_scorer: string
          p_week_id: string
        }
        Returns: {
          entered_by: string | null
          entered_via: string | null
          entry_reason: string | null
          id: string
          league_id: string
          manager_id: string
          pick_made_at: string | null
          predicted_eliminated_couple_id: string | null
          predicted_eliminated_couple_id_2: string | null
          predicted_runner_up_couple_id: string | null
          predicted_third_place_couple_id: string | null
          predicted_top_scorer_couple_id: string | null
          predicted_winner_couple_id: string | null
          submitted_at: string
          week_id: string
        }
        SetofOptions: {
          from: "*"
          to: "predictions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_later_dance_card: {
        Args: { p_episode_id: string; p_plan: Json }
        Returns: undefined
      }
      apply_lifeline_settlement: {
        Args: { p_episode_id: string; p_plan: Json }
        Returns: undefined
      }
      apply_round_exception: {
        Args: {
          p_actor_id: string
          p_bonus: number
          p_couple_id: string
          p_episode_id: string
          p_kind: string
          p_note: string
          p_round_ids: string[]
        }
        Returns: undefined
      }
      assert_episode_draft_actor: {
        Args: { p_actor_id: string; p_episode_id: string }
        Returns: undefined
      }
      assert_special_dance_plan: {
        Args: { p_episode_id: string; p_plan: Json }
        Returns: undefined
      }
      assert_trades_open: { Args: { p_league_id: string }; Returns: undefined }
      can_view_trade: { Args: { p_trade_id: string }; Returns: boolean }
      cancel_account_deletion: { Args: never; Returns: undefined }
      capture_expired_finale_deadlines: {
        Args: { p_league_id?: string }
        Returns: undefined
      }
      clear_lifeline_pick: {
        Args: { p_league_id: string; p_slot_number: number; p_week_id: string }
        Returns: undefined
      }
      close_grand_finale_late: {
        Args: { p_league_id: string; p_manager_id: string }
        Returns: undefined
      }
      commit_episode_publication: {
        Args: {
          p_episode_id: string
          p_plan: Json
          p_published_by: string
          p_snapshot: Json
        }
        Returns: undefined
      }
      commit_episode_publication_with_later_weeks: {
        Args: {
          p_episode_id: string
          p_plan: Json
          p_published_by: string
          p_snapshot: Json
        }
        Returns: undefined
      }
      commit_episode_reveal: {
        Args: {
          p_actor_id: string
          p_couple_id: string
          p_episode_id: string
          p_plan: Json
          p_snapshot: Json
          p_undo: boolean
        }
        Returns: undefined
      }
      commit_team_reveal: {
        Args: {
          p_actor_id: string
          p_episode_id: string
          p_plan: Json
          p_snapshot: Json
          p_team_id: string
          p_undo: boolean
        }
        Returns: undefined
      }
      couple_night_exception: {
        Args: { p_couple_id: string; p_episode_id: string }
        Returns: string
      }
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
          current_turn_started_at: string | null
          custom_pick_order: string[] | null
          draft_scheduled_at: string | null
          draft_status: string
          draft_type: string
          id: string
          invite_code: string
          lifeline_enabled: boolean
          lifeline_starts_week: number | null
          name: string
          pick_time_limit_seconds: number
          prediction_lock_coast: string
          prediction_lock_hours_before_air: number
          recast_on_since: string | null
          roster_size: number
          trades_enabled: boolean
          trades_on_since: string | null
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
      dance_card_snapshot: { Args: never; Returns: Json }
      delete_league: { Args: { p_league_id: string }; Returns: undefined }
      delete_special_dance: {
        Args: { p_actor_id: string; p_episode_id: string; p_team_id: string }
        Returns: undefined
      }
      demote_commissioner: {
        Args: { p_league_id: string; p_user_id: string }
        Returns: undefined
      }
      disable_lifeline: { Args: { p_league_id: string }; Returns: undefined }
      drop_round_unit: { Args: { p_team_id: string }; Returns: undefined }
      drop_round_units: {
        Args: { p_keep: number; p_round_id: string }
        Returns: undefined
      }
      effective_grand_finale_deadline: {
        Args: { p_league_id: string }
        Returns: string
      }
      effective_hard_deadline_week: {
        Args: { p_league_id: string }
        Returns: number
      }
      enable_lifeline: {
        Args: {
          p_actor_id: string
          p_equalizer: Json
          p_league_id: string
          p_starts_week: number
        }
        Returns: undefined
      }
      episode_couple_dance_signature: {
        Args: { p_couple_id: string; p_draft: boolean; p_episode_id: string }
        Returns: Json
      }
      episode_publication_snapshot: {
        Args: { p_episode_id: string }
        Returns: Json
      }
      generate_co_manager_invite_code: {
        Args: { p_league_id: string }
        Returns: string
      }
      get_co_manager_invite_info: {
        Args: { p_code: string }
        Returns: {
          league_name: string
          primary_display_name: string
        }[]
      }
      is_league_commissioner: {
        Args: { p_league_id: string }
        Returns: boolean
      }
      is_league_member: { Args: { p_league_id: string }; Returns: boolean }
      join_as_co_manager: {
        Args: { p_code: string }
        Returns: {
          commissioner_id: string
          created_at: string
          current_turn_started_at: string | null
          custom_pick_order: string[] | null
          draft_scheduled_at: string | null
          draft_status: string
          draft_type: string
          id: string
          invite_code: string
          lifeline_enabled: boolean
          lifeline_starts_week: number | null
          name: string
          pick_time_limit_seconds: number
          prediction_lock_coast: string
          prediction_lock_hours_before_air: number
          recast_on_since: string | null
          roster_size: number
          trades_enabled: boolean
          trades_on_since: string | null
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
      join_league: {
        Args: { p_invite_code: string }
        Returns: {
          commissioner_id: string
          created_at: string
          current_turn_started_at: string | null
          custom_pick_order: string[] | null
          draft_scheduled_at: string | null
          draft_status: string
          draft_type: string
          id: string
          invite_code: string
          lifeline_enabled: boolean
          lifeline_starts_week: number | null
          name: string
          pick_time_limit_seconds: number
          prediction_lock_coast: string
          prediction_lock_hours_before_air: number
          recast_on_since: string | null
          roster_size: number
          trades_enabled: boolean
          trades_on_since: string | null
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
      latest_scored_week: {
        Args: { p_league_id: string }
        Returns: {
          id: string
          is_double_elimination_week: boolean
          is_elimination_week: boolean
          is_finale: boolean
          season_id: string
          theme: string | null
          week_number: number
        }
        SetofOptions: {
          from: "*"
          to: "competition_weeks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      league_invite_preview: {
        Args: { p_invite_code: string }
        Returns: {
          draft_in_progress: boolean
          league_name: string
          team_count: number
        }[]
      }
      leave_league: { Args: { p_league_id: string }; Returns: undefined }
      lifeline_first_open_week: {
        Args: { p_league_id: string }
        Returns: number
      }
      lifeline_lock_at: {
        Args: { p_league_id: string; p_week_id: string }
        Returns: string
      }
      lifeline_publication_inputs: { Args: never; Returns: Json }
      lifeline_slot_is_dead: {
        Args: {
          p_league_id: string
          p_manager_id: string
          p_slot_number: number
          p_week_number: number
        }
        Returns: boolean
      }
      make_auto_draft_pick: {
        Args: { p_league_id: string }
        Returns: {
          auto_source: string | null
          couple_id: string
          id: string
          is_auto: boolean
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
      make_draft_pick: {
        Args: { p_couple_id: string; p_league_id: string }
        Returns: {
          auto_source: string | null
          couple_id: string
          id: string
          is_auto: boolean
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
      mark_episodes_watched_through: {
        Args: { p_week_number: number }
        Returns: undefined
      }
      materialize_team_scores: {
        Args: { p_episode_id: string; p_team_id: string }
        Returns: undefined
      }
      my_co_manager_invite_code: {
        Args: { p_league_id: string }
        Returns: string
      }
      prediction_lock_at: {
        Args: { p_league_id: string; p_week_id: string }
        Returns: string
      }
      process_due_recasts: { Args: never; Returns: Json }
      process_league_recast: {
        Args: {
          p_league_id: string
          p_start_week: number
          p_week_id: string
          p_week_number: number
        }
        Returns: number
      }
      promote_to_commissioner: {
        Args: { p_league_id: string; p_user_id: string }
        Returns: undefined
      }
      propose_trade: {
        Args: { p_league_id: string; p_legs: Json }
        Returns: string
      }
      recast_claim_state: {
        Args: {
          p_claim: Database["public"]["Tables"]["waiver_claims"]["Row"]
          p_cycle_weeks: number[]
        }
        Returns: string
      }
      recast_drop_locked: {
        Args: {
          p_couple_id: string
          p_cycle_weeks: number[]
          p_league_id: string
          p_manager_id: string
        }
        Returns: boolean
      }
      recast_next_cycle: {
        Args: { p_league_id: string }
        Returns: {
          due_at: string
          results_in: boolean
          start_week: number
          week_id: string
          week_number: number
        }[]
      }
      recast_order: {
        Args: { p_league_id: string }
        Returns: {
          last_week_total: number
          list_position: number
          manager_id: string
          season_total: number
        }[]
      }
      recast_pending_drops: {
        Args: { p_league_id: string }
        Returns: {
          couple_id: string
          manager_id: string
        }[]
      }
      recast_runs_overdue: {
        Args: never
        Returns: {
          due_at: string
          leagues: number
          results_in: boolean
          week_number: number
        }[]
      }
      recast_runs_since: { Args: { p_league_id: string }; Returns: string }
      record_draft_pick: {
        Args: {
          p_auto_source: string
          p_couple_id: string
          p_league_id: string
          p_manager_id: string
        }
        Returns: {
          auto_source: string | null
          couple_id: string
          id: string
          is_auto: boolean
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
      refresh_round_points: {
        Args: { p_actor_id: string; p_round_id: string }
        Returns: undefined
      }
      remove_co_manager: {
        Args: { p_league_id: string; p_team_user_id: string }
        Returns: undefined
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
          current_turn_started_at: string | null
          custom_pick_order: string[] | null
          draft_scheduled_at: string | null
          draft_status: string
          draft_type: string
          id: string
          invite_code: string
          lifeline_enabled: boolean
          lifeline_starts_week: number | null
          name: string
          pick_time_limit_seconds: number
          prediction_lock_coast: string
          prediction_lock_hours_before_air: number
          recast_on_since: string | null
          roster_size: number
          trades_enabled: boolean
          trades_on_since: string | null
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
      replace_weekly_scores: {
        Args: { p_episode_id: string; p_revision: string; p_rows: Json }
        Returns: undefined
      }
      request_account_deletion: { Args: never; Returns: undefined }
      reset_draft: { Args: { p_league_id: string }; Returns: undefined }
      resolve_acting_league_member: {
        Args: { p_league_id: string }
        Returns: string
      }
      respond_to_trade: {
        Args: { p_accept: boolean; p_trade_id: string }
        Returns: string
      }
      round_heat_name: {
        Args: { p_heat: number; p_round_type: string; p_unit_count: number }
        Returns: string
      }
      round_special_mode: { Args: { p_scoring: string }; Returns: string }
      run_league_trades: {
        Args: {
          p_league_id: string
          p_start_week: number
          p_week_number: number
        }
        Returns: number
      }
      run_recast_claims: {
        Args: {
          p_league_id: string
          p_order: string[]
          p_start_week: number
          p_week_number: number
        }
        Returns: number
      }
      save_episode_draft: { Args: { p_input: Json }; Returns: undefined }
      save_episode_draft_checked: { Args: { p_input: Json }; Returns: Json }
      save_episode_rounds: {
        Args: { p_actor_id: string; p_episode_id: string; p_rounds: Json }
        Returns: Json
      }
      save_episode_teams: {
        Args: { p_actor_id: string; p_episode_id: string; p_teams: Json }
        Returns: Json
      }
      save_recast_list: {
        Args: { p_claims: Json; p_league_id: string }
        Returns: {
          couple_id: string
          created_at: string
          drop_couple_id: string | null
          id: string
          league_id: string
          manager_id: string
          priority_order: number | null
          resolved_at: string | null
          result: string | null
          slot_number: number
          start_week: number | null
          status: string
          submitted_by: string | null
          week_number: number
        }[]
        SetofOptions: {
          from: "*"
          to: "waiver_claims"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      save_round_exception: {
        Args: {
          p_actor_id: string
          p_bonus: number
          p_couple_id: string
          p_episode_id: string
          p_kind: string
          p_note: string
          p_round_ids: string[]
        }
        Returns: undefined
      }
      save_special_dance: {
        Args: { p_actor_id: string; p_dance: Json; p_episode_id: string }
        Returns: string
      }
      save_special_dance_points: {
        Args: {
          p_actor_id: string
          p_episode_id: string
          p_scores: Json
          p_team_id: string
        }
        Returns: undefined
      }
      save_team_couple_marks: {
        Args: {
          p_actor_id: string
          p_couple_id: string
          p_episode_id: string
          p_marks: Json
          p_team_id: string
        }
        Returns: undefined
      }
      save_team_marks: {
        Args: {
          p_actor_id: string
          p_episode_id: string
          p_marks: Json
          p_team_id: string
        }
        Returns: undefined
      }
      seed_episode_correction: {
        Args: { p_episode_id: string; p_started_by: string }
        Returns: string
      }
      set_custom_draft_order: {
        Args: { p_league_id: string; p_user_ids: string[] }
        Returns: undefined
      }
      set_dance_card_points: {
        Args: {
          p_actor_id: string
          p_league_id: string
          p_migration_id: string
          p_revision: string
          p_rows: Json
          p_version: string
        }
        Returns: number
      }
      set_draft_autopilot: {
        Args: { p_enabled: boolean; p_league_id: string }
        Returns: boolean
      }
      set_draft_couple_release: {
        Args: {
          p_actor_id: string
          p_couple_id: string
          p_episode_id: string
          p_release: boolean
        }
        Returns: undefined
      }
      set_draft_order: {
        Args: { p_league_id: string; p_ordered_user_ids: string[] }
        Returns: undefined
      }
      set_draft_queue: {
        Args: { p_couple_ids: string[]; p_league_id: string }
        Returns: undefined
      }
      set_lifeline_pick: {
        Args: {
          p_couple_id: string
          p_league_id: string
          p_slot_number: number
          p_week_id: string
        }
        Returns: {
          couple_id: string
          id: string
          league_id: string
          manager_id: string
          picked_by: string
          slot_number: number
          updated_at: string
          week_id: string
        }
        SetofOptions: {
          from: "*"
          to: "lifeline_picks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_member_draft_autopilot: {
        Args: { p_enabled: boolean; p_league_id: string; p_user_id: string }
        Returns: boolean
      }
      set_results_contributor: {
        Args: { p_enabled: boolean; p_user_id: string }
        Returns: undefined
      }
      set_round_bonus: {
        Args: {
          p_actor_id: string
          p_bonus: number
          p_episode_id: string
          p_round_id: string
        }
        Returns: undefined
      }
      set_special_draft_release: {
        Args: {
          p_actor_id: string
          p_episode_id: string
          p_release: boolean
          p_team_id: string
        }
        Returns: undefined
      }
      set_trades_enabled: {
        Args: { p_enabled: boolean; p_league_id: string }
        Returns: undefined
      }
      special_dance_blocker: {
        Args: { p_team_id: string; p_when: string }
        Returns: string
      }
      special_dance_complete: { Args: { p_team_id: string }; Returns: boolean }
      special_dance_label: {
        Args: { p_team: Database["public"]["Tables"]["episode_teams"]["Row"] }
        Returns: string
      }
      special_dance_panel: { Args: { p_team_id: string }; Returns: string[] }
      special_dance_status: { Args: { p_team_id: string }; Returns: Json }
      start_draft: {
        Args: { p_league_id: string }
        Returns: {
          commissioner_id: string
          created_at: string
          current_turn_started_at: string | null
          custom_pick_order: string[] | null
          draft_scheduled_at: string | null
          draft_status: string
          draft_type: string
          id: string
          invite_code: string
          lifeline_enabled: boolean
          lifeline_starts_week: number | null
          name: string
          pick_time_limit_seconds: number
          prediction_lock_coast: string
          prediction_lock_hours_before_air: number
          recast_on_since: string | null
          roster_size: number
          trades_enabled: boolean
          trades_on_since: string | null
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
      submit_podium_prediction: {
        Args: {
          p_league_id: string
          p_runner_up: string
          p_third: string
          p_top_scorer: string
          p_week_id: string
          p_winner: string
        }
        Returns: {
          entered_by: string | null
          entered_via: string | null
          entry_reason: string | null
          id: string
          league_id: string
          manager_id: string
          pick_made_at: string | null
          predicted_eliminated_couple_id: string | null
          predicted_eliminated_couple_id_2: string | null
          predicted_runner_up_couple_id: string | null
          predicted_third_place_couple_id: string | null
          predicted_top_scorer_couple_id: string | null
          predicted_winner_couple_id: string | null
          submitted_at: string
          week_id: string
        }
        SetofOptions: {
          from: "*"
          to: "predictions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_prediction: {
        Args: {
          p_league_id: string
          p_predicted_eliminated_couple_id: string
          p_predicted_eliminated_couple_id_2: string
          p_predicted_top_scorer_couple_id: string
          p_week_id: string
        }
        Returns: {
          entered_by: string | null
          entered_via: string | null
          entry_reason: string | null
          id: string
          league_id: string
          manager_id: string
          pick_made_at: string | null
          predicted_eliminated_couple_id: string | null
          predicted_eliminated_couple_id_2: string | null
          predicted_runner_up_couple_id: string | null
          predicted_third_place_couple_id: string | null
          predicted_top_scorer_couple_id: string | null
          predicted_winner_couple_id: string | null
          submitted_at: string
          week_id: string
        }
        SetofOptions: {
          from: "*"
          to: "predictions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sync_round_immunity: {
        Args: { p_actor_id: string; p_round_id: string }
        Returns: undefined
      }
      team_eligible_members: {
        Args: { p_episode_id: string; p_team_id: string }
        Returns: string[]
      }
      team_song_key: { Args: { p_song: string }; Returns: string }
      trade_cash_available: { Args: { p_league_id: string }; Returns: number }
      trade_cash_room: {
        Args: {
          p_count_accepted: boolean
          p_league_id: string
          p_manager_id: string
        }
        Returns: number
      }
      trade_deadline: { Args: { p_league_id: string }; Returns: string }
      trade_moves: {
        Args: { p_trade_id: string }
        Returns: {
          couple_id: string
          manager_id: string
          slot_number: number
        }[]
      }
      trade_problem: {
        Args: { p_at_run: boolean; p_trade_id: string }
        Returns: string
      }
      trade_problem_text: { Args: { p_problem: string }; Returns: string }
      undo_last_pick: { Args: { p_league_id: string }; Returns: undefined }
      unlock_draft_scores_through: {
        Args: { p_week_number: number }
        Returns: undefined
      }
      unlock_grand_finale_late: {
        Args: {
          p_acknowledge_resolved: boolean
          p_late_factor: number
          p_league_id: string
          p_manager_id: string
        }
        Returns: undefined
      }
      unmark_episodes_watched_from: {
        Args: { p_week_number: number }
        Returns: undefined
      }
      update_league_settings: {
        Args: {
          p_draft_scheduled_at: string
          p_draft_type: string
          p_league_id: string
          p_pick_time_limit_seconds: number
          p_prediction_lock_coast: string
          p_prediction_lock_hours_before_air: number
          p_waiver_claim_method: string
          p_waiver_mode: string
        }
        Returns: {
          commissioner_id: string
          created_at: string
          current_turn_started_at: string | null
          custom_pick_order: string[] | null
          draft_scheduled_at: string | null
          draft_status: string
          draft_type: string
          id: string
          invite_code: string
          lifeline_enabled: boolean
          lifeline_starts_week: number | null
          name: string
          pick_time_limit_seconds: number
          prediction_lock_coast: string
          prediction_lock_hours_before_air: number
          recast_on_since: string | null
          roster_size: number
          trades_enabled: boolean
          trades_on_since: string | null
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
          p_bonus_picks_distance_penalty: number
          p_bonus_picks_points_per_correct: number
          p_bonus_picks_scoring_method: string
          p_bonus_picks_tier_pay_style: string
          p_bonus_picks_tier_size: number
          p_curtain_call_near_miss_enabled: boolean
          p_elimination_prediction_points: number
          p_eliminations_category_enabled: boolean
          p_eliminations_category_weight: number
          p_fifth_place_points: number
          p_first_place_points: number
          p_fourth_place_points: number
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
          bonus_picks_distance_penalty: number | null
          bonus_picks_points_per_correct: number
          bonus_picks_scoring_method: string | null
          bonus_picks_tier_pay_style: string
          bonus_picks_tier_size: number | null
          curtain_call_near_miss_enabled: boolean
          dance_card_version: string
          elimination_prediction_points: number
          eliminations_category_enabled: boolean
          eliminations_category_weight: number
          fifth_place_points: number
          first_place_points: number
          fourth_place_points: number
          grand_finale_deadline_at: string | null
          grand_finale_deadline_season_id: string | null
          judges_score_category_enabled: boolean
          judges_score_category_weight: number
          judges_score_multiplier: number
          judges_score_multiplier_customized: boolean
          judges_score_starts_week: number
          league_id: string
          locking_exempt: boolean
          revision: number
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
      update_scoring_categories_checked: {
        Args: {
          p_expected_revision: number
          p_league_id: string
          p_values: Json
        }
        Returns: {
          bonus_picks_category_enabled: boolean
          bonus_picks_category_weight: number
          bonus_picks_distance_penalty: number | null
          bonus_picks_points_per_correct: number
          bonus_picks_scoring_method: string | null
          bonus_picks_tier_pay_style: string
          bonus_picks_tier_size: number | null
          curtain_call_near_miss_enabled: boolean
          dance_card_version: string
          elimination_prediction_points: number
          eliminations_category_enabled: boolean
          eliminations_category_weight: number
          fifth_place_points: number
          first_place_points: number
          fourth_place_points: number
          grand_finale_deadline_at: string | null
          grand_finale_deadline_season_id: string | null
          judges_score_category_enabled: boolean
          judges_score_category_weight: number
          judges_score_multiplier: number
          judges_score_multiplier_customized: boolean
          judges_score_starts_week: number
          league_id: string
          locking_exempt: boolean
          revision: number
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
      veto_trade: { Args: { p_trade_id: string }; Returns: string }
      visible_draft_dance_scores: {
        Args: never
        Returns: {
          couple_id: string
          created_at: string
          dance_style_name: string
          episode_id: string
          scaled_score: number
          total_score: number
          week_id: string
          week_number: number
        }[]
      }
      visible_draft_lineup: {
        Args: never
        Returns: {
          couple_id: string
          created_at: string
          dance_style_name: string
          episode_id: string
          song_title: string
          week_id: string
        }[]
      }
      visible_draft_special_scores: {
        Args: never
        Returns: {
          couple_id: string
          created_at: string
          dance_style_name: string
          episode_id: string
          max_score: number
          scaled_score: number
          team_id: string
          total_score: number
          week_id: string
          week_number: number
        }[]
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
