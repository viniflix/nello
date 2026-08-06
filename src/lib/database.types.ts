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
    PostgrestVersion: "14.1"
  }
  private: {
    Tables: {
      empty_patient_removal_audit: {
        Row: {
          care_episode_id: string
          id: string
          nutritionist_id: string
          patient_id: string
          patient_snapshot: Json
          reason: string
          removed_at: string
          removed_by: string
        }
        Insert: {
          care_episode_id: string
          id?: string
          nutritionist_id: string
          patient_id: string
          patient_snapshot?: Json
          reason?: string
          removed_at?: string
          removed_by: string
        }
        Update: {
          care_episode_id?: string
          id?: string
          nutritionist_id?: string
          patient_id?: string
          patient_snapshot?: Json
          reason?: string
          removed_at?: string
          removed_by?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_patient_xp: {
        Args: {
          p_nutritionist_id: string
          p_patient_id: string
          p_reason?: string
          p_xp: number
        }
        Returns: Json
      }
      approve_patient_link: { Args: { p_patient_id: string }; Returns: Json }
      build_clinical_record_amendment_impact: {
        Args: {
          p_record: Database["public"]["Tables"]["clinical_records"]["Row"]
        }
        Returns: Json
      }
      can_access_patient_photo_object: {
        Args: { p_name: string }
        Returns: boolean
      }
      can_list_clinical_attachment: {
        Args: { p_attachment_id: string }
        Returns: boolean
      }
      can_manage_clinical_attachment: {
        Args: { p_episode_id: string }
        Returns: boolean
      }
      can_manage_clinical_record_correction: {
        Args: {
          p_action: string
          p_actor: string
          p_replacement_record_id: string
        }
        Returns: boolean
      }
      can_open_clinical_attachment: {
        Args: { p_attachment_id: string }
        Returns: boolean
      }
      can_read_care_episode: {
        Args: { p_episode_id: string }
        Returns: boolean
      }
      can_read_clinical_attachment_object: {
        Args: { p_bucket_id: string; p_name: string }
        Returns: boolean
      }
      can_read_clinical_record: {
        Args: { p_record_id: string }
        Returns: boolean
      }
      can_read_legal_guardian_event: {
        Args: { p_event_id: string }
        Returns: boolean
      }
      can_start_clinical_record_correction: {
        Args: { p_actor: string; p_record_id: string }
        Returns: boolean
      }
      can_upload_clinical_attachment_object: {
        Args: { p_bucket_id: string; p_name: string }
        Returns: boolean
      }
      can_upload_patient_photo_object: {
        Args: { p_name: string }
        Returns: boolean
      }
      can_write_active_care_episode: {
        Args: { p_episode_id: string }
        Returns: boolean
      }
      can_write_active_meal_plan: {
        Args: {
          p_care_episode_id: string
          p_nutritionist_id: string
          p_patient_id: string
        }
        Returns: boolean
      }
      check_and_grant_achievements: {
        Args: { p_user_id: string }
        Returns: {
          description: string
          icon_name: string
          name: string
        }[]
      }
      check_is_admin: { Args: never; Returns: boolean }
      clear_message_notifications_from_sender: {
        Args: { p_sender_id: string }
        Returns: undefined
      }
      clinical_attachment_actor_role: {
        Args: { p_actor_id: string; p_source: string }
        Returns: string
      }
      clinical_record_canonical_payload: {
        Args: {
          p_content: Json
          p_record: Database["public"]["Tables"]["clinical_records"]["Row"]
          p_retrospective_reason: string
        }
        Returns: Json
      }
      clinical_record_signed_by: {
        Args: { p_record_id: string }
        Returns: string
      }
      clone_diet_template_to_patient: {
        Args: {
          p_name?: string
          p_nutritionist_id: string
          p_patient_id: string
          p_template_id: string
        }
        Returns: number
      }
      clone_meal_template_to_plan: {
        Args: {
          p_meal_plan_id: number
          p_meal_template_id: string
          p_meal_time?: string
          p_meal_type: string
        }
        Returns: number
      }
      create_appointment_reminders: { Args: never; Returns: undefined }
      create_daily_log_reminders: { Args: never; Returns: undefined }
      create_notification: {
        Args: {
          p_content?: Json
          p_link_url?: string
          p_message?: string
          p_title?: string
          p_type?: string
          p_user_id: string
        }
        Returns: number
      }
      current_recent_authentication_evidence: { Args: never; Returns: Json }
      delete_patient: { Args: { patient_id: string }; Returns: undefined }
      empty_patient_removal_status: {
        Args: { p_patient_id: string }
        Returns: Json
      }
      end_care_episode: {
        Args: { p_end_reason?: string; p_patient_id: string }
        Returns: Json
      }
      get_admin_dashboard_stats: { Args: never; Returns: Json }
      get_chat_recipient_profile: {
        Args: { recipient_id: string }
        Returns: {
          avatar_url: string
          id: string
          is_active: boolean
          last_seen_at: string
          name: string
          nutritionist_id: string
          user_type: string
        }[]
      }
      get_comprehensive_activity_feed_optimized: {
        Args: { p_limit?: number; p_nutritionist_id: string }
        Returns: {
          activity_data: Json
          activity_date: string
          activity_id: string
          activity_type: string
          patient_id: string
          patient_name: string
        }[]
      }
      get_daily_adherence: {
        Args: { p_nutritionist_id: string }
        Returns: number
      }
      get_financial_summary: {
        Args: { end_date: string; start_date: string }
        Returns: Json
      }
      get_invite_details: {
        Args: { p_invite_code: string }
        Returns: {
          nutritionist_gender: string
          nutritionist_name: string
          patient_name: string
        }[]
      }
      get_meal_plan_with_foods_optimized: {
        Args: { p_meal_plan_id: string }
        Returns: Json
      }
      get_nutritionist_conversations: {
        Args: { p_nutritionist_id: string }
        Returns: {
          is_active: boolean
          last_message_at: string
          last_message_content: string
          last_seen_at: string
          recipient_avatar: string
          recipient_id: string
          recipient_name: string
          unread_count: number
        }[]
      }
      get_nutritionist_detail: {
        Args: { p_nutritionist_id: string }
        Returns: Json
      }
      get_nutritionists_list: {
        Args: never
        Returns: {
          created_at: string
          email: string
          id: string
          is_active: boolean
          last_activity: string
          name: string
          patients_count: number
        }[]
      }
      get_operational_health_summary: {
        Args: { p_nutritionist_id?: string; p_window_hours?: number }
        Returns: Json
      }
      get_own_profile_attrs: {
        Args: never
        Returns: {
          is_admin: boolean
          user_type: string
        }[]
      }
      get_patients_for_new_chat: {
        Args: { p_nutritionist_id: string }
        Returns: {
          avatar_url: string
          id: string
          is_active: boolean
          last_seen_at: string
          name: string
        }[]
      }
      get_patients_low_adherence_optimized: {
        Args: { p_days_threshold?: number; p_nutritionist_id: string }
        Returns: {
          days_since_last_meal: number
          last_meal_date: string
          patient_id: string
          patient_name: string
        }[]
      }
      get_patients_pending_data_optimized: {
        Args: { p_nutritionist_id: string }
        Returns: {
          has_anamnese: boolean
          has_anthropometry: boolean
          has_meal_plan: boolean
          has_prescription: boolean
          patient_id: string
          patient_name: string
          pending_items: string[]
        }[]
      }
      get_system_live_logs: {
        Args: { limit_count?: number }
        Returns: {
          event_timestamp: string
          id: string
          message: string
          type: string
          user_name: string
        }[]
      }
      get_tcc_study_metrics: { Args: never; Returns: Json }
      get_user_id: { Args: never; Returns: string }
      has_current_clinical_capacity: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      has_meaningful_clinical_text: {
        Args: { p_value: string }
        Returns: boolean
      }
      increment_checkin_streak: {
        Args: { p_nutritionist_id: string; p_patient_id: string }
        Returns: undefined
      }
      interact_notification: {
        Args: { p_delete_if_message?: boolean; p_notification_id: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_nutritionist: { Args: never; Returns: boolean }
      is_patient: { Args: never; Returns: boolean }
      is_patient_visible_clinical_record: {
        Args: { p_record_id: string }
        Returns: boolean
      }
      lock_and_can_write_active_care_episode: {
        Args: { p_episode_id: string }
        Returns: boolean
      }
      log_activity_event: {
        Args: {
          p_event_name: string
          p_event_version?: number
          p_nutritionist_id?: string
          p_patient_id?: string
          p_payload?: Json
          p_source_module?: string
        }
        Returns: string
      }
      log_bug_report: {
        Args: {
          p_column_number?: number
          p_component_stack?: string
          p_console_log?: Json
          p_error_message?: string
          p_error_type?: string
          p_line_number?: number
          p_metadata?: Json
          p_route?: string
          p_source_file?: string
          p_stack_trace?: string
          p_user_agent?: string
          p_user_email?: string
          p_user_id?: string
          p_user_name?: string
          p_user_type?: string
        }
        Returns: string
      }
      log_meal_action: {
        Args: {
          p_action: string
          p_details?: Json
          p_meal_date?: string
          p_meal_id: number
          p_meal_time?: string
          p_meal_type?: string
          p_patient_id: string
        }
        Returns: number
      }
      log_meal_action_secure: {
        Args: { p_action: string; p_details: Json; p_meal_id: string }
        Returns: undefined
      }
      log_operational_event: {
        Args: {
          p_error_message?: string
          p_event_type?: string
          p_latency_ms?: number
          p_metadata?: Json
          p_module: string
          p_nutritionist_id?: string
          p_operation: string
          p_patient_id?: string
        }
        Returns: number
      }
      minimal_patient_snapshot: {
        Args: { p_patient_id: string }
        Returns: Json
      }
      normalize_meal_time: { Args: { p_value: string }; Returns: string }
      notify_care_episode_participant: {
        Args: {
          p_episode_id: string
          p_message: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: undefined
      }
      patient_has_meaningful_data: {
        Args: { p_patient_id: string }
        Returns: boolean
      }
      process_patient_reminders: {
        Args: { p_patient_id?: string }
        Returns: Json
      }
      project_clinical_evolution_record: {
        Args: {
          p_record: Database["public"]["Tables"]["clinical_records"]["Row"]
        }
        Returns: Json
      }
      project_clinical_record_chain_item: {
        Args: {
          p_record: Database["public"]["Tables"]["clinical_records"]["Row"]
        }
        Returns: Json
      }
      project_patient_clinical_record: {
        Args: {
          p_record: Database["public"]["Tables"]["clinical_records"]["Row"]
        }
        Returns: Json
      }
      promote_draft_to_active: {
        Args: { p_draft_id: number; p_patient_id: string }
        Returns: undefined
      }
      redeem_invite_code: { Args: { input_code: string }; Returns: Json }
      reject_patient_link: { Args: { p_patient_id: string }; Returns: Json }
      require_verification_admin: { Args: never; Returns: undefined }
      resolve_active_care_episode: {
        Args: { p_patient_id: string }
        Returns: string
      }
      set_active_meal_plan: { Args: { p_plan_id: number }; Returns: undefined }
      soft_delete_meal: { Args: { p_meal_id: number }; Returns: boolean }
      start_care_episode: {
        Args: { p_patient_id: string; p_start_reason?: string }
        Returns: Json
      }
      transition_appointment_status:
        | {
            Args: {
              p_appointment_id: number
              p_next_status: string
              p_reason?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_appointment_id: string
              p_next_status: string
              p_reason?: string
            }
            Returns: Json
          }
      upsert_full_meal_plan: {
        Args: { p_meals: Json; p_plan_data: Json; p_plan_id: number }
        Returns: Json
      }
      validate_clinical_record_content: {
        Args: {
          p_content: Json
          p_require_meaningful: boolean
          p_sections_snapshot: Json
        }
        Returns: number
      }
      validate_evolution_template_sections: {
        Args: { p_sections: Json }
        Returns: boolean
      }
      write_care_episode_activity: {
        Args: {
          p_actor_user_id: string
          p_episode: Database["public"]["Tables"]["care_episodes"]["Row"]
          p_event_name: string
          p_reason?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          criteria: Json
          description: string
          icon_name: string
          id: number
          name: string
        }
        Insert: {
          criteria: Json
          description: string
          icon_name: string
          id?: never
          name: string
        }
        Update: {
          criteria?: Json
          description?: string
          icon_name?: string
          id?: never
          name?: string
        }
        Relationships: []
      }
      activity_log: {
        Row: {
          actor_user_id: string | null
          created_at: string | null
          event_name: string
          event_version: number | null
          id: string
          nutritionist_id: string | null
          occurred_at: string
          patient_id: string | null
          payload: Json | null
          source_module: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string | null
          event_name: string
          event_version?: number | null
          id?: string
          nutritionist_id?: string | null
          occurred_at?: string
          patient_id?: string | null
          payload?: Json | null
          source_module?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string | null
          event_name?: string
          event_version?: number | null
          id?: string
          nutritionist_id?: string | null
          occurred_at?: string
          patient_id?: string | null
          payload?: Json | null
          source_module?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "activity_log_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      anamnesis_records: {
        Row: {
          appointment_id: number | null
          attachments: Json
          care_episode_id: string | null
          content: Json
          created_at: string | null
          date: string
          filled_by: string | null
          history_log: Json
          id: string
          lgpd_consented: boolean | null
          lgpd_consented_at: string | null
          lgpd_ip_address: string | null
          notes: string | null
          nutritionist_id: string
          patient_id: string
          public_access_token: string | null
          status: string | null
          template_id: string | null
          template_snapshot: Json | null
          token_expires_at: string | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          appointment_id?: number | null
          attachments?: Json
          care_episode_id?: string | null
          content: Json
          created_at?: string | null
          date?: string
          filled_by?: string | null
          history_log?: Json
          id?: string
          lgpd_consented?: boolean | null
          lgpd_consented_at?: string | null
          lgpd_ip_address?: string | null
          notes?: string | null
          nutritionist_id: string
          patient_id: string
          public_access_token?: string | null
          status?: string | null
          template_id?: string | null
          template_snapshot?: Json | null
          token_expires_at?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          appointment_id?: number | null
          attachments?: Json
          care_episode_id?: string | null
          content?: Json
          created_at?: string | null
          date?: string
          filled_by?: string | null
          history_log?: Json
          id?: string
          lgpd_consented?: boolean | null
          lgpd_consented_at?: string | null
          lgpd_ip_address?: string | null
          notes?: string | null
          nutritionist_id?: string
          patient_id?: string
          public_access_token?: string | null
          status?: string | null
          template_id?: string | null
          template_snapshot?: Json | null
          token_expires_at?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "anamnesis_records_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamnesis_records_care_episode_id_fkey"
            columns: ["care_episode_id"]
            isOneToOne: false
            referencedRelation: "care_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamnesis_records_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "anamnesis_records_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamnesis_records_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "anamnesis_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      anamnesis_templates: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_system_default: boolean | null
          nutritionist_id: string | null
          sections: Json
          title: string
          updated_at: string | null
          version: number
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_system_default?: boolean | null
          nutritionist_id?: string | null
          sections: Json
          title: string
          updated_at?: string | null
          version?: number
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_system_default?: boolean | null
          nutritionist_id?: string | null
          sections?: Json
          title?: string
          updated_at?: string | null
          version?: number
        }
        Relationships: []
      }
      appointments: {
        Row: {
          appointment_time: string
          appointment_type: string | null
          care_episode_id: string | null
          created_at: string | null
          duration: number | null
          id: number
          notes: string | null
          nutritionist_id: string
          patient_id: string | null
          reminder_sent_at: string | null
          start_time: string
          status: string
          unregistered_patient_name: string | null
        }
        Insert: {
          appointment_time: string
          appointment_type?: string | null
          care_episode_id?: string | null
          created_at?: string | null
          duration?: number | null
          id?: number
          notes?: string | null
          nutritionist_id: string
          patient_id?: string | null
          reminder_sent_at?: string | null
          start_time: string
          status?: string
          unregistered_patient_name?: string | null
        }
        Update: {
          appointment_time?: string
          appointment_type?: string | null
          care_episode_id?: string | null
          created_at?: string | null
          duration?: number | null
          id?: number
          notes?: string | null
          nutritionist_id?: string
          patient_id?: string | null
          reminder_sent_at?: string | null
          start_time?: string
          status?: string
          unregistered_patient_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_care_episode_id_fkey"
            columns: ["care_episode_id"]
            isOneToOne: false
            referencedRelation: "care_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "appointments_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      archived_patient_links: {
        Row: {
          archived_at: string | null
          id: string
          nutritionist_id: string
          patient_id: string
          patient_snapshot: Json
        }
        Insert: {
          archived_at?: string | null
          id?: string
          nutritionist_id: string
          patient_id: string
          patient_snapshot?: Json
        }
        Update: {
          archived_at?: string | null
          id?: string
          nutritionist_id?: string
          patient_id?: string
          patient_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "archived_patient_links_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "archived_patient_links_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archived_patient_links_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "archived_patient_links_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bug_reports: {
        Row: {
          bug_type: string | null
          column_number: number | null
          component_stack: string | null
          console_log: Json | null
          created_at: string | null
          error_message: string | null
          error_type: string | null
          id: string
          is_resolved: boolean | null
          line_number: number | null
          metadata: Json | null
          resolved_at: string | null
          route: string | null
          severity: string | null
          source_file: string | null
          stack_trace: string | null
          updated_at: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
          user_name: string | null
          user_type: string | null
        }
        Insert: {
          bug_type?: string | null
          column_number?: number | null
          component_stack?: string | null
          console_log?: Json | null
          created_at?: string | null
          error_message?: string | null
          error_type?: string | null
          id?: string
          is_resolved?: boolean | null
          line_number?: number | null
          metadata?: Json | null
          resolved_at?: string | null
          route?: string | null
          severity?: string | null
          source_file?: string | null
          stack_trace?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
          user_type?: string | null
        }
        Update: {
          bug_type?: string | null
          column_number?: number | null
          component_stack?: string | null
          console_log?: Json | null
          created_at?: string | null
          error_message?: string | null
          error_type?: string | null
          id?: string
          is_resolved?: boolean | null
          line_number?: number | null
          metadata?: Json | null
          resolved_at?: string | null
          route?: string | null
          severity?: string | null
          source_file?: string | null
          stack_trace?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
          user_type?: string | null
        }
        Relationships: []
      }
      care_episodes: {
        Row: {
          created_at: string
          end_reason: string | null
          ended_at: string | null
          ended_by: string | null
          id: string
          is_simulation: boolean
          nutritionist_id: string
          patient_id: string
          patient_snapshot: Json
          start_reason: string
          started_at: string
          started_by: string | null
          status: string
          student_id: string | null
          supervisor_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          is_simulation?: boolean
          nutritionist_id: string
          patient_id: string
          patient_snapshot?: Json
          start_reason?: string
          started_at?: string
          started_by?: string | null
          status?: string
          student_id?: string | null
          supervisor_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          is_simulation?: boolean
          nutritionist_id?: string
          patient_id?: string
          patient_snapshot?: Json
          start_reason?: string
          started_at?: string
          started_by?: string | null
          status?: string
          student_id?: string | null
          supervisor_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_episodes_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "care_episodes_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_episodes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "care_episodes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_episodes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "care_episodes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_episodes_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "care_episodes_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chats: {
        Row: {
          created_at: string | null
          from_id: string
          id: number
          media_url: string | null
          message: string
          message_type: string
          to_id: string
        }
        Insert: {
          created_at?: string | null
          from_id: string
          id?: never
          media_url?: string | null
          message: string
          message_type?: string
          to_id: string
        }
        Update: {
          created_at?: string | null
          from_id?: string
          id?: never
          media_url?: string | null
          message?: string
          message_type?: string
          to_id?: string
        }
        Relationships: []
      }
      checkin_fields: {
        Row: {
          created_at: string | null
          field_type: string
          id: string
          is_required: boolean | null
          label: string
          options: Json | null
          order_index: number | null
          score_weight: number | null
          template_id: string
          unit: string | null
        }
        Insert: {
          created_at?: string | null
          field_type: string
          id?: string
          is_required?: boolean | null
          label: string
          options?: Json | null
          order_index?: number | null
          score_weight?: number | null
          template_id: string
          unit?: string | null
        }
        Update: {
          created_at?: string | null
          field_type?: string
          id?: string
          is_required?: boolean | null
          label?: string
          options?: Json | null
          order_index?: number | null
          score_weight?: number | null
          template_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checkin_fields_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checkin_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checkin_schedules: {
        Row: {
          care_episode_id: string | null
          channel: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          last_sent_at: string | null
          next_send_at: string | null
          nutritionist_id: string
          patient_id: string
          template_id: string
        }
        Insert: {
          care_episode_id?: string | null
          channel?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_sent_at?: string | null
          next_send_at?: string | null
          nutritionist_id: string
          patient_id: string
          template_id: string
        }
        Update: {
          care_episode_id?: string | null
          channel?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_sent_at?: string | null
          next_send_at?: string | null
          nutritionist_id?: string
          patient_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkin_schedules_care_episode_id_fkey"
            columns: ["care_episode_id"]
            isOneToOne: false
            referencedRelation: "care_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_schedules_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "checkin_schedules_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_schedules_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "checkin_schedules_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_schedules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checkin_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checkin_sessions: {
        Row: {
          adherence_percentage: number | null
          care_episode_id: string | null
          completed_at: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          nutritionist_id: string
          patient_id: string
          responses: Json | null
          schedule_id: string | null
          score_max: number | null
          score_total: number | null
          sent_at: string | null
          status: string | null
          template_id: string
          token: string
        }
        Insert: {
          adherence_percentage?: number | null
          care_episode_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          nutritionist_id: string
          patient_id: string
          responses?: Json | null
          schedule_id?: string | null
          score_max?: number | null
          score_total?: number | null
          sent_at?: string | null
          status?: string | null
          template_id: string
          token?: string
        }
        Update: {
          adherence_percentage?: number | null
          care_episode_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          nutritionist_id?: string
          patient_id?: string
          responses?: Json | null
          schedule_id?: string | null
          score_max?: number | null
          score_total?: number | null
          sent_at?: string | null
          status?: string | null
          template_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkin_sessions_care_episode_id_fkey"
            columns: ["care_episode_id"]
            isOneToOne: false
            referencedRelation: "care_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_sessions_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "checkin_sessions_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_sessions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "checkin_sessions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_sessions_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "checkin_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_sessions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checkin_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checkin_templates: {
        Row: {
          channel: string | null
          created_at: string | null
          description: string | null
          frequency: string
          id: string
          is_active: boolean | null
          metadata: Json | null
          name: string
          nutritionist_id: string
          send_days: number[] | null
          send_time: string | null
          updated_at: string | null
        }
        Insert: {
          channel?: string | null
          created_at?: string | null
          description?: string | null
          frequency?: string
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name: string
          nutritionist_id: string
          send_days?: number[] | null
          send_time?: string | null
          updated_at?: string | null
        }
        Update: {
          channel?: string | null
          created_at?: string | null
          description?: string | null
          frequency?: string
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name?: string
          nutritionist_id?: string
          send_days?: number[] | null
          send_time?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checkin_templates_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "checkin_templates_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_attachment_categories: {
        Row: {
          code: string
          created_at: string
          is_active: boolean
          label: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          is_active?: boolean
          label: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          is_active?: boolean
          label?: string
          updated_at?: string
        }
        Relationships: []
      }
      clinical_attachment_events: {
        Row: {
          action: string
          actor_id: string
          actor_role: string
          care_episode_id: string
          clinical_attachment_id: string
          created_at: string
          from_status: string | null
          from_visibility: string | null
          id: string
          metadata: Json
          patient_id: string
          reason: string | null
          to_status: string
          to_visibility: string
        }
        Insert: {
          action: string
          actor_id: string
          actor_role: string
          care_episode_id: string
          clinical_attachment_id: string
          created_at?: string
          from_status?: string | null
          from_visibility?: string | null
          id?: string
          metadata?: Json
          patient_id: string
          reason?: string | null
          to_status: string
          to_visibility: string
        }
        Update: {
          action?: string
          actor_id?: string
          actor_role?: string
          care_episode_id?: string
          clinical_attachment_id?: string
          created_at?: string
          from_status?: string | null
          from_visibility?: string | null
          id?: string
          metadata?: Json
          patient_id?: string
          reason?: string | null
          to_status?: string
          to_visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_attachment_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "clinical_attachment_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_attachment_events_attachment_scope_fk"
            columns: ["clinical_attachment_id", "patient_id", "care_episode_id"]
            isOneToOne: false
            referencedRelation: "clinical_attachments"
            referencedColumns: ["id", "patient_id", "care_episode_id"]
          },
          {
            foreignKeyName: "clinical_attachment_events_care_episode_id_fkey"
            columns: ["care_episode_id"]
            isOneToOne: false
            referencedRelation: "care_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_attachment_events_clinical_attachment_id_fkey"
            columns: ["clinical_attachment_id"]
            isOneToOne: false
            referencedRelation: "clinical_attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_attachment_events_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "clinical_attachment_events_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_attachments: {
        Row: {
          author_id: string
          care_episode_id: string
          category_code: string
          clinical_date: string | null
          clinical_record_id: string | null
          created_at: string
          description: string | null
          id: string
          invalidated_at: string | null
          invalidation_reason: string | null
          mime_type: string
          original_filename: string
          patient_id: string
          replaces_attachment_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          root_attachment_id: string
          sha256: string | null
          size_bytes: number
          source: string
          status: string
          storage_bucket: string
          storage_path: string
          updated_at: string
          upload_confirmed_at: string | null
          upload_expires_at: string
          version: number
          visibility: string
        }
        Insert: {
          author_id: string
          care_episode_id: string
          category_code: string
          clinical_date?: string | null
          clinical_record_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          invalidated_at?: string | null
          invalidation_reason?: string | null
          mime_type: string
          original_filename: string
          patient_id: string
          replaces_attachment_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          root_attachment_id: string
          sha256?: string | null
          size_bytes: number
          source: string
          status?: string
          storage_bucket?: string
          storage_path: string
          updated_at?: string
          upload_confirmed_at?: string | null
          upload_expires_at?: string
          version?: number
          visibility?: string
        }
        Update: {
          author_id?: string
          care_episode_id?: string
          category_code?: string
          clinical_date?: string | null
          clinical_record_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          invalidated_at?: string | null
          invalidation_reason?: string | null
          mime_type?: string
          original_filename?: string
          patient_id?: string
          replaces_attachment_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          root_attachment_id?: string
          sha256?: string | null
          size_bytes?: number
          source?: string
          status?: string
          storage_bucket?: string
          storage_path?: string
          updated_at?: string
          upload_confirmed_at?: string | null
          upload_expires_at?: string
          version?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_attachments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "clinical_attachments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_attachments_care_episode_id_fkey"
            columns: ["care_episode_id"]
            isOneToOne: false
            referencedRelation: "care_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_attachments_category_code_fkey"
            columns: ["category_code"]
            isOneToOne: false
            referencedRelation: "clinical_attachment_categories"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "clinical_attachments_episode_patient_fk"
            columns: ["care_episode_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "care_episodes"
            referencedColumns: ["id", "patient_id"]
          },
          {
            foreignKeyName: "clinical_attachments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "clinical_attachments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_attachments_record_episode_patient_fk"
            columns: ["clinical_record_id", "care_episode_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "clinical_records"
            referencedColumns: ["id", "care_episode_id", "patient_id"]
          },
          {
            foreignKeyName: "clinical_attachments_replaces_fk"
            columns: ["replaces_attachment_id"]
            isOneToOne: false
            referencedRelation: "clinical_attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_attachments_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "clinical_attachments_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_attachments_root_fk"
            columns: ["root_attachment_id"]
            isOneToOne: false
            referencedRelation: "clinical_attachments"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_evolution_template_events: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          id: string
          metadata: Json
          template_code: string
          version: number | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          id?: string
          metadata?: Json
          template_code: string
          version?: number | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          template_code?: string
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clinical_evolution_template_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "clinical_evolution_template_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_evolution_template_events_template_code_fkey"
            columns: ["template_code"]
            isOneToOne: false
            referencedRelation: "clinical_evolution_templates"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "evolution_template_events_version_fk"
            columns: ["template_code", "version"]
            isOneToOne: false
            referencedRelation: "clinical_evolution_template_versions"
            referencedColumns: ["template_code", "version"]
          },
        ]
      }
      clinical_evolution_template_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          sections_snapshot: Json
          template_code: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          sections_snapshot: Json
          template_code: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          sections_snapshot?: Json
          template_code?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "clinical_evolution_template_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "clinical_evolution_template_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_evolution_template_versions_template_code_fkey"
            columns: ["template_code"]
            isOneToOne: false
            referencedRelation: "clinical_evolution_templates"
            referencedColumns: ["code"]
          },
        ]
      }
      clinical_evolution_templates: {
        Row: {
          category: string
          code: string
          created_at: string
          description: string | null
          is_active: boolean
          name: string
          owner_id: string | null
          sections: Json
          updated_at: string
        }
        Insert: {
          category?: string
          code: string
          created_at?: string
          description?: string | null
          is_active?: boolean
          name: string
          owner_id?: string | null
          sections: Json
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          description?: string | null
          is_active?: boolean
          name?: string
          owner_id?: string | null
          sections?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_evolution_templates_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "clinical_evolution_templates_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_record_amendments: {
        Row: {
          abandoned_at: string | null
          abandonment_reason: string | null
          actor_id: string
          amendment_type: string
          authentication_evidence: Json
          canonical_hash: string | null
          care_episode_id: string
          created_at: string
          effective_at: string | null
          id: string
          impact_hash: string
          impact_snapshot: Json
          patient_id: string
          reason: string
          replacement_record_id: string | null
          responsible_id: string
          root_record_id: string
          status: string
          supervisor_id: string | null
          target_record_id: string
        }
        Insert: {
          abandoned_at?: string | null
          abandonment_reason?: string | null
          actor_id: string
          amendment_type: string
          authentication_evidence?: Json
          canonical_hash?: string | null
          care_episode_id: string
          created_at?: string
          effective_at?: string | null
          id?: string
          impact_hash: string
          impact_snapshot: Json
          patient_id: string
          reason: string
          replacement_record_id?: string | null
          responsible_id: string
          root_record_id: string
          status: string
          supervisor_id?: string | null
          target_record_id: string
        }
        Update: {
          abandoned_at?: string | null
          abandonment_reason?: string | null
          actor_id?: string
          amendment_type?: string
          authentication_evidence?: Json
          canonical_hash?: string | null
          care_episode_id?: string
          created_at?: string
          effective_at?: string | null
          id?: string
          impact_hash?: string
          impact_snapshot?: Json
          patient_id?: string
          reason?: string
          replacement_record_id?: string | null
          responsible_id?: string
          root_record_id?: string
          status?: string
          supervisor_id?: string | null
          target_record_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_record_amendments_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "clinical_record_amendments_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_record_amendments_care_episode_id_fkey"
            columns: ["care_episode_id"]
            isOneToOne: false
            referencedRelation: "care_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_record_amendments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "clinical_record_amendments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_record_amendments_replacement_record_id_fkey"
            columns: ["replacement_record_id"]
            isOneToOne: true
            referencedRelation: "clinical_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_record_amendments_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "clinical_record_amendments_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_record_amendments_root_record_id_fkey"
            columns: ["root_record_id"]
            isOneToOne: false
            referencedRelation: "clinical_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_record_amendments_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "clinical_record_amendments_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_record_amendments_target_record_id_fkey"
            columns: ["target_record_id"]
            isOneToOne: false
            referencedRelation: "clinical_records"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_record_events: {
        Row: {
          actor_id: string
          clinical_record_id: string
          created_at: string
          from_status: string | null
          id: string
          metadata: Json
          reason: string | null
          to_status: string
        }
        Insert: {
          actor_id: string
          clinical_record_id: string
          created_at?: string
          from_status?: string | null
          id?: string
          metadata?: Json
          reason?: string | null
          to_status: string
        }
        Update: {
          actor_id?: string
          clinical_record_id?: string
          created_at?: string
          from_status?: string | null
          id?: string
          metadata?: Json
          reason?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_record_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "clinical_record_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_record_events_clinical_record_id_fkey"
            columns: ["clinical_record_id"]
            isOneToOne: false
            referencedRelation: "clinical_records"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_record_types: {
        Row: {
          category: string
          code: string
          created_at: string
          is_active: boolean
          is_system: boolean
          minimum_schema: Json
          name: string
          updated_at: string
        }
        Insert: {
          category: string
          code: string
          created_at?: string
          is_active?: boolean
          is_system?: boolean
          minimum_schema?: Json
          name: string
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          is_active?: boolean
          is_system?: boolean
          minimum_schema?: Json
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      clinical_records: {
        Row: {
          author_id: string
          canonical_format_version: number
          canonical_hash: string | null
          care_episode_id: string
          chain_version: number
          content: Json
          created_at: string
          encounter_at: string
          id: string
          nutritionist_id: string
          patient_id: string
          record_type: string
          recorded_at: string
          replaces_record_id: string | null
          retrospective_reason: string | null
          revision: number
          root_record_id: string
          signed_at: string | null
          source_references: Json
          status: string
          student_id: string | null
          supervisor_id: string | null
          template_code: string | null
          template_version: number | null
          updated_at: string
          visibility: string
        }
        Insert: {
          author_id: string
          canonical_format_version: number
          canonical_hash?: string | null
          care_episode_id: string
          chain_version: number
          content?: Json
          created_at?: string
          encounter_at?: string
          id?: string
          nutritionist_id: string
          patient_id: string
          record_type: string
          recorded_at?: string
          replaces_record_id?: string | null
          retrospective_reason?: string | null
          revision?: number
          root_record_id: string
          signed_at?: string | null
          source_references?: Json
          status?: string
          student_id?: string | null
          supervisor_id?: string | null
          template_code?: string | null
          template_version?: number | null
          updated_at?: string
          visibility?: string
        }
        Update: {
          author_id?: string
          canonical_format_version?: number
          canonical_hash?: string | null
          care_episode_id?: string
          chain_version?: number
          content?: Json
          created_at?: string
          encounter_at?: string
          id?: string
          nutritionist_id?: string
          patient_id?: string
          record_type?: string
          recorded_at?: string
          replaces_record_id?: string | null
          retrospective_reason?: string | null
          revision?: number
          root_record_id?: string
          signed_at?: string | null
          source_references?: Json
          status?: string
          student_id?: string | null
          supervisor_id?: string | null
          template_code?: string | null
          template_version?: number | null
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_records_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "clinical_records_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_records_care_episode_id_fkey"
            columns: ["care_episode_id"]
            isOneToOne: false
            referencedRelation: "care_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_records_episode_owner_fk"
            columns: ["care_episode_id", "patient_id", "nutritionist_id"]
            isOneToOne: false
            referencedRelation: "care_episodes"
            referencedColumns: ["id", "patient_id", "nutritionist_id"]
          },
          {
            foreignKeyName: "clinical_records_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "clinical_records_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_records_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "clinical_records_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_records_record_type_fkey"
            columns: ["record_type"]
            isOneToOne: false
            referencedRelation: "clinical_record_types"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "clinical_records_replaces_record_id_fkey"
            columns: ["replaces_record_id"]
            isOneToOne: true
            referencedRelation: "clinical_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_records_root_record_id_fkey"
            columns: ["root_record_id"]
            isOneToOne: false
            referencedRelation: "clinical_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "clinical_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_records_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "clinical_records_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_records_template_version_fk"
            columns: ["template_code", "template_version"]
            isOneToOne: false
            referencedRelation: "clinical_evolution_template_versions"
            referencedColumns: ["template_code", "version"]
          },
        ]
      }
      communication_automations: {
        Row: {
          automation_key: string
          channel: string
          config: Json
          cooldown_hours: number
          created_at: string
          description: string | null
          id: number
          is_active: boolean
          name: string
          nutritionist_id: string
          template_body: string
          template_title: string | null
          trigger_event: string
          updated_at: string
        }
        Insert: {
          automation_key: string
          channel?: string
          config?: Json
          cooldown_hours?: number
          created_at?: string
          description?: string | null
          id?: number
          is_active?: boolean
          name: string
          nutritionist_id: string
          template_body: string
          template_title?: string | null
          trigger_event: string
          updated_at?: string
        }
        Update: {
          automation_key?: string
          channel?: string
          config?: Json
          cooldown_hours?: number
          created_at?: string
          description?: string | null
          id?: number
          is_active?: boolean
          name?: string
          nutritionist_id?: string
          template_body?: string
          template_title?: string | null
          trigger_event?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_automations_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "communication_automations_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      diet_template_food_substitutions: {
        Row: {
          created_at: string | null
          id: string
          quantity: number | null
          substitute_food_id: string | null
          template_food_id: string | null
          unit: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          quantity?: number | null
          substitute_food_id?: string | null
          template_food_id?: string | null
          unit?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          quantity?: number | null
          substitute_food_id?: string | null
          template_food_id?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diet_template_food_substitutions_template_food_id_fkey"
            columns: ["template_food_id"]
            isOneToOne: false
            referencedRelation: "diet_template_foods"
            referencedColumns: ["id"]
          },
        ]
      }
      diet_template_foods: {
        Row: {
          created_at: string | null
          food_id: string | null
          id: string
          meal_id: string | null
          observation: string | null
          order_index: number
          quantity: number
          unit: string | null
        }
        Insert: {
          created_at?: string | null
          food_id?: string | null
          id?: string
          meal_id?: string | null
          observation?: string | null
          order_index?: number
          quantity: number
          unit?: string | null
        }
        Update: {
          created_at?: string | null
          food_id?: string | null
          id?: string
          meal_id?: string | null
          observation?: string | null
          order_index?: number
          quantity?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diet_template_foods_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "diet_template_meals"
            referencedColumns: ["id"]
          },
        ]
      }
      diet_template_meals: {
        Row: {
          created_at: string | null
          id: string
          name: string
          order_index: number
          template_id: string | null
          time: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          order_index?: number
          template_id?: string | null
          time?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          order_index?: number
          template_id?: string | null
          time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diet_template_meals_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "diet_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      diet_templates: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          tags: string[] | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          tags?: string[] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          tags?: string[] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      energy_expenditure_calculations: {
        Row: {
          activities: Json | null
          activity_factor: number | null
          activity_level: number | null
          age: number
          body_fat_percentage: number | null
          care_episode_id: string | null
          created_at: string | null
          final_planned_kcal: number | null
          gender: string
          get: number | null
          get_result: number | null
          get_with_activities: number | null
          height: number
          id: number
          injury_factor: number | null
          mets_activities: Json | null
          nutritionist_id: string | null
          patient_id: string
          protocol: string | null
          target_weight: number | null
          tmb: number | null
          tmb_protocol: string | null
          tmb_result: number | null
          updated_at: string | null
          venta_adjusted: number | null
          venta_adjustment_kcal: number | null
          venta_target_weight: number | null
          venta_timeframe_days: number | null
          weight: number
        }
        Insert: {
          activities?: Json | null
          activity_factor?: number | null
          activity_level?: number | null
          age: number
          body_fat_percentage?: number | null
          care_episode_id?: string | null
          created_at?: string | null
          final_planned_kcal?: number | null
          gender: string
          get?: number | null
          get_result?: number | null
          get_with_activities?: number | null
          height: number
          id?: number
          injury_factor?: number | null
          mets_activities?: Json | null
          nutritionist_id?: string | null
          patient_id: string
          protocol?: string | null
          target_weight?: number | null
          tmb?: number | null
          tmb_protocol?: string | null
          tmb_result?: number | null
          updated_at?: string | null
          venta_adjusted?: number | null
          venta_adjustment_kcal?: number | null
          venta_target_weight?: number | null
          venta_timeframe_days?: number | null
          weight: number
        }
        Update: {
          activities?: Json | null
          activity_factor?: number | null
          activity_level?: number | null
          age?: number
          body_fat_percentage?: number | null
          care_episode_id?: string | null
          created_at?: string | null
          final_planned_kcal?: number | null
          gender?: string
          get?: number | null
          get_result?: number | null
          get_with_activities?: number | null
          height?: number
          id?: number
          injury_factor?: number | null
          mets_activities?: Json | null
          nutritionist_id?: string | null
          patient_id?: string
          protocol?: string | null
          target_weight?: number | null
          tmb?: number | null
          tmb_protocol?: string | null
          tmb_result?: number | null
          updated_at?: string | null
          venta_adjusted?: number | null
          venta_adjustment_kcal?: number | null
          venta_target_weight?: number | null
          venta_timeframe_days?: number | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "energy_expenditure_calculations_care_episode_id_fkey"
            columns: ["care_episode_id"]
            isOneToOne: false
            referencedRelation: "care_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "energy_expenditure_calculations_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "energy_expenditure_calculations_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "energy_expenditure_calculations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "energy_expenditure_calculations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      external_api_cache: {
        Row: {
          api_name: string
          created_at: string | null
          expires_at: string
          id: string
          request_key: string
          response_data: Json
        }
        Insert: {
          api_name: string
          created_at?: string | null
          expires_at: string
          id?: string
          request_key: string
          response_data: Json
        }
        Update: {
          api_name?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          request_key?: string
          response_data?: Json
        }
        Relationships: []
      }
      feed_tasks: {
        Row: {
          created_at: string
          description: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          metadata: Json
          nutritionist_id: string
          patient_id: string | null
          priority_reason: string | null
          priority_score: number
          resolved_at: string | null
          resolved_by: string | null
          snooze_until: string | null
          source_id: string | null
          source_type: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          metadata?: Json
          nutritionist_id: string
          patient_id?: string | null
          priority_reason?: string | null
          priority_score?: number
          resolved_at?: string | null
          resolved_by?: string | null
          snooze_until?: string | null
          source_id?: string | null
          source_type: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          metadata?: Json
          nutritionist_id?: string
          patient_id?: string | null
          priority_reason?: string | null
          priority_score?: number
          resolved_at?: string | null
          resolved_by?: string | null
          snooze_until?: string | null
          source_id?: string | null
          source_type?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_tasks_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "feed_tasks_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_tasks_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "feed_tasks_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_tasks_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "feed_tasks_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_records: {
        Row: {
          amount: number
          appointment_id: string | null
          attachment_url: string | null
          category: string
          created_at: string | null
          date: string | null
          description: string | null
          due_date: string | null
          fee_percentage: number | null
          id: string
          installment_number: number | null
          is_recurring: boolean | null
          net_amount: number | null
          nutritionist_id: string
          patient_id: string | null
          payment_method: string | null
          service_id: string | null
          status: string | null
          total_installments: number | null
          type: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          appointment_id?: string | null
          attachment_url?: string | null
          category: string
          created_at?: string | null
          date?: string | null
          description?: string | null
          due_date?: string | null
          fee_percentage?: number | null
          id?: string
          installment_number?: number | null
          is_recurring?: boolean | null
          net_amount?: number | null
          nutritionist_id: string
          patient_id?: string | null
          payment_method?: string | null
          service_id?: string | null
          status?: string | null
          total_installments?: number | null
          type: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          attachment_url?: string | null
          category?: string
          created_at?: string | null
          date?: string | null
          description?: string | null
          due_date?: string | null
          fee_percentage?: number | null
          id?: string
          installment_number?: number | null
          is_recurring?: boolean | null
          net_amount?: number | null
          nutritionist_id?: string
          patient_id?: string | null
          payment_method?: string | null
          service_id?: string | null
          status?: string | null
          total_installments?: number | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_records_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "financial_records_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_records_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "financial_records_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_records_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_transactions: {
        Row: {
          amount: number
          category: string | null
          created_at: string | null
          description: string
          due_date: string | null
          id: number
          income_source: string | null
          nutritionist_id: string
          patient_id: string | null
          status: string | null
          transaction_date: string
          type: string
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string | null
          description: string
          due_date?: string | null
          id?: never
          income_source?: string | null
          nutritionist_id: string
          patient_id?: string | null
          status?: string | null
          transaction_date: string
          type: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string | null
          description?: string
          due_date?: string | null
          id?: never
          income_source?: string | null
          nutritionist_id?: string
          patient_id?: string | null
          status?: string | null
          transaction_date?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "financial_transactions_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "financial_transactions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      food_household_measures: {
        Row: {
          food_id: string | null
          grams: number | null
          id: number
          measure_id: number | null
          quantity: number | null
        }
        Insert: {
          food_id?: string | null
          grams?: number | null
          id: number
          measure_id?: number | null
          quantity?: number | null
        }
        Update: {
          food_id?: string | null
          grams?: number | null
          id?: number
          measure_id?: number | null
          quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "food_household_measures_measure_id_fkey"
            columns: ["measure_id"]
            isOneToOne: false
            referencedRelation: "household_measures"
            referencedColumns: ["id"]
          },
        ]
      }
      food_measures: {
        Row: {
          created_at: string | null
          id: string
          label: string
          nutritionist_food_id: string | null
          reference_food_id: string | null
          weight_in_grams: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          label: string
          nutritionist_food_id?: string | null
          reference_food_id?: string | null
          weight_in_grams: number
        }
        Update: {
          created_at?: string | null
          id?: string
          label?: string
          nutritionist_food_id?: string | null
          reference_food_id?: string | null
          weight_in_grams?: number
        }
        Relationships: [
          {
            foreignKeyName: "food_measures_nutritionist_food_id_fkey"
            columns: ["nutritionist_food_id"]
            isOneToOne: false
            referencedRelation: "nutritionist_foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_measures_reference_food_id_fkey"
            columns: ["reference_food_id"]
            isOneToOne: false
            referencedRelation: "reference_foods"
            referencedColumns: ["id"]
          },
        ]
      }
      glycemia_records: {
        Row: {
          care_episode_id: string | null
          condition: string | null
          created_at: string | null
          date: string | null
          id: string
          notes: string | null
          nutritionist_id: string | null
          patient_id: string
          value: number
        }
        Insert: {
          care_episode_id?: string | null
          condition?: string | null
          created_at?: string | null
          date?: string | null
          id?: string
          notes?: string | null
          nutritionist_id?: string | null
          patient_id: string
          value: number
        }
        Update: {
          care_episode_id?: string | null
          condition?: string | null
          created_at?: string | null
          date?: string | null
          id?: string
          notes?: string | null
          nutritionist_id?: string | null
          patient_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "glycemia_records_care_episode_id_fkey"
            columns: ["care_episode_id"]
            isOneToOne: false
            referencedRelation: "care_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "glycemia_records_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "glycemia_records_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "glycemia_records_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "glycemia_records_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_records: {
        Row: {
          bioimpedance: Json | null
          bone_diameters: Json | null
          care_episode_id: string | null
          change_reason: string | null
          circumferences: Json | null
          created_at: string | null
          created_by_user_id: string | null
          head_circumference: number | null
          height: number | null
          id: number
          is_latest_revision: boolean
          notes: string | null
          patient_id: string
          peso_usual: number | null
          photos: string[] | null
          record_date: string
          results: Json | null
          revision_group_id: number | null
          revision_number: number
          skinfolds: Json | null
          supersedes_record_id: number | null
          updated_at: string | null
          weight: number | null
        }
        Insert: {
          bioimpedance?: Json | null
          bone_diameters?: Json | null
          care_episode_id?: string | null
          change_reason?: string | null
          circumferences?: Json | null
          created_at?: string | null
          created_by_user_id?: string | null
          head_circumference?: number | null
          height?: number | null
          id?: never
          is_latest_revision?: boolean
          notes?: string | null
          patient_id: string
          peso_usual?: number | null
          photos?: string[] | null
          record_date: string
          results?: Json | null
          revision_group_id?: number | null
          revision_number?: number
          skinfolds?: Json | null
          supersedes_record_id?: number | null
          updated_at?: string | null
          weight?: number | null
        }
        Update: {
          bioimpedance?: Json | null
          bone_diameters?: Json | null
          care_episode_id?: string | null
          change_reason?: string | null
          circumferences?: Json | null
          created_at?: string | null
          created_by_user_id?: string | null
          head_circumference?: number | null
          height?: number | null
          id?: never
          is_latest_revision?: boolean
          notes?: string | null
          patient_id?: string
          peso_usual?: number | null
          photos?: string[] | null
          record_date?: string
          results?: Json | null
          revision_group_id?: number | null
          revision_number?: number
          skinfolds?: Json | null
          supersedes_record_id?: number | null
          updated_at?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "growth_records_care_episode_id_fkey"
            columns: ["care_episode_id"]
            isOneToOne: false
            referencedRelation: "care_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "growth_records_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "growth_records_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "growth_records_supersedes_record_id_fkey"
            columns: ["supersedes_record_id"]
            isOneToOne: false
            referencedRelation: "growth_records"
            referencedColumns: ["id"]
          },
        ]
      }
      household_measures: {
        Row: {
          category: string | null
          code: string
          created_at: string | null
          description: string | null
          grams_equivalent: number | null
          id: number
          is_active: boolean | null
          ml_equivalent: number | null
          name: string
          order_index: number | null
        }
        Insert: {
          category?: string | null
          code: string
          created_at?: string | null
          description?: string | null
          grams_equivalent?: number | null
          id?: number
          is_active?: boolean | null
          ml_equivalent?: number | null
          name: string
          order_index?: number | null
        }
        Update: {
          category?: string | null
          code?: string
          created_at?: string | null
          description?: string | null
          grams_equivalent?: number | null
          id?: number
          is_active?: boolean | null
          ml_equivalent?: number | null
          name?: string
          order_index?: number | null
        }
        Relationships: []
      }
      lab_results: {
        Row: {
          care_episode_id: string | null
          created_at: string | null
          id: number
          notes: string | null
          patient_id: string
          pdf_filename: string | null
          pdf_url: string | null
          reference_max: number | null
          reference_min: number | null
          status: string | null
          test_date: string
          test_name: string
          test_unit: string | null
          test_value: string | null
          updated_at: string | null
        }
        Insert: {
          care_episode_id?: string | null
          created_at?: string | null
          id?: number
          notes?: string | null
          patient_id: string
          pdf_filename?: string | null
          pdf_url?: string | null
          reference_max?: number | null
          reference_min?: number | null
          status?: string | null
          test_date: string
          test_name: string
          test_unit?: string | null
          test_value?: string | null
          updated_at?: string | null
        }
        Update: {
          care_episode_id?: string | null
          created_at?: string | null
          id?: number
          notes?: string | null
          patient_id?: string
          pdf_filename?: string | null
          pdf_url?: string | null
          reference_max?: number | null
          reference_min?: number | null
          status?: string | null
          test_date?: string
          test_name?: string
          test_unit?: string | null
          test_value?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lab_results_care_episode_id_fkey"
            columns: ["care_episode_id"]
            isOneToOne: false
            referencedRelation: "care_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_results_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "lab_results_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_risk_rules: {
        Row: {
          config: Json
          created_at: string
          high_threshold: number | null
          id: number
          is_active: boolean
          low_threshold: number | null
          marker_key: string
          marker_label: string
          nutritionist_id: string | null
          risk_high: string
          risk_low: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          high_threshold?: number | null
          id?: number
          is_active?: boolean
          low_threshold?: number | null
          marker_key: string
          marker_label: string
          nutritionist_id?: string | null
          risk_high?: string
          risk_low?: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          high_threshold?: number | null
          id?: number
          is_active?: boolean
          low_threshold?: number | null
          marker_key?: string
          marker_label?: string
          nutritionist_id?: string | null
          risk_high?: string
          risk_low?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_risk_rules_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "lab_risk_rules_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_guardian_events: {
        Row: {
          actor_id: string
          created_at: string
          from_status: string | null
          id: string
          legal_guardian_id: string
          metadata: Json
          reason: string | null
          to_status: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          from_status?: string | null
          id?: string
          legal_guardian_id: string
          metadata?: Json
          reason?: string | null
          to_status: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          from_status?: string | null
          id?: string
          legal_guardian_id?: string
          metadata?: Json
          reason?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_guardian_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "legal_guardian_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_guardian_events_legal_guardian_id_fkey"
            columns: ["legal_guardian_id"]
            isOneToOne: false
            referencedRelation: "patient_episode_legal_guardians"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_audit_log: {
        Row: {
          action: string
          care_episode_id: string | null
          created_at: string | null
          details: Json | null
          id: number
          meal_date: string | null
          meal_id: number | null
          meal_time: string | null
          meal_type: string | null
          patient_id: string
        }
        Insert: {
          action: string
          care_episode_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: number
          meal_date?: string | null
          meal_id?: number | null
          meal_time?: string | null
          meal_type?: string | null
          patient_id: string
        }
        Update: {
          action?: string
          care_episode_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: number
          meal_date?: string | null
          meal_id?: number | null
          meal_time?: string | null
          meal_type?: string | null
          patient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_audit_log_care_episode_id_fkey"
            columns: ["care_episode_id"]
            isOneToOne: false
            referencedRelation: "care_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_audit_log_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "meals"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_edit_history: {
        Row: {
          care_episode_id: string | null
          edited_at: string
          id: number
          meal_id: number
          new_data: Json
          original_data: Json
          patient_id: string
        }
        Insert: {
          care_episode_id?: string | null
          edited_at?: string
          id?: number
          meal_id: number
          new_data: Json
          original_data: Json
          patient_id: string
        }
        Update: {
          care_episode_id?: string | null
          edited_at?: string
          id?: number
          meal_id?: number
          new_data?: Json
          original_data?: Json
          patient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_edit_history_care_episode_id_fkey"
            columns: ["care_episode_id"]
            isOneToOne: false
            referencedRelation: "care_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_edit_history_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "meals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_edit_history_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "meal_edit_history_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_history: {
        Row: {
          action: string
          after_data: Json | null
          before_data: Json | null
          changed_by: string | null
          id: number
          meal_id: number
          timestamp: string | null
        }
        Insert: {
          action: string
          after_data?: Json | null
          before_data?: Json | null
          changed_by?: string | null
          id?: number
          meal_id: number
          timestamp?: string | null
        }
        Update: {
          action?: string
          after_data?: Json | null
          before_data?: Json | null
          changed_by?: string | null
          id?: number
          meal_id?: number
          timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "meal_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_history_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "meals"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_items: {
        Row: {
          calories: number
          carbs: number
          fat: number
          id: number
          meal_id: number
          name: string
          nutritionist_food_id: string | null
          protein: number
          quantity: number
          reference_food_id: string | null
          unit: string | null
        }
        Insert: {
          calories: number
          carbs: number
          fat: number
          id?: never
          meal_id: number
          name: string
          nutritionist_food_id?: string | null
          protein: number
          quantity: number
          reference_food_id?: string | null
          unit?: string | null
        }
        Update: {
          calories?: number
          carbs?: number
          fat?: number
          id?: never
          meal_id?: number
          name?: string
          nutritionist_food_id?: string | null
          protein?: number
          quantity?: number
          reference_food_id?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_items_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "meals"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plan_food_substitutions: {
        Row: {
          created_at: string | null
          id: number
          meal_plan_food_id: number
          notes: string | null
          quantity: number | null
          substitute_food_id: string
          unit: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          meal_plan_food_id: number
          notes?: string | null
          quantity?: number | null
          substitute_food_id: string
          unit?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          meal_plan_food_id?: number
          notes?: string | null
          quantity?: number | null
          substitute_food_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_food_substitutions_meal_plan_food_id_fkey"
            columns: ["meal_plan_food_id"]
            isOneToOne: false
            referencedRelation: "meal_plan_foods"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plan_foods: {
        Row: {
          calories: number
          carbs: number
          created_at: string | null
          fat: number
          food_id: string
          id: number
          meal_plan_meal_id: number
          notes: string | null
          order_index: number | null
          patient_description: string | null
          protein: number
          quantity: number
          unit: string
        }
        Insert: {
          calories: number
          carbs: number
          created_at?: string | null
          fat: number
          food_id: string
          id?: number
          meal_plan_meal_id: number
          notes?: string | null
          order_index?: number | null
          patient_description?: string | null
          protein: number
          quantity: number
          unit: string
        }
        Update: {
          calories?: number
          carbs?: number
          created_at?: string | null
          fat?: number
          food_id?: string
          id?: number
          meal_plan_meal_id?: number
          notes?: string | null
          order_index?: number | null
          patient_description?: string | null
          protein?: number
          quantity?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_foods_meal_plan_meal_id_fkey"
            columns: ["meal_plan_meal_id"]
            isOneToOne: false
            referencedRelation: "meal_plan_meals"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plan_meals: {
        Row: {
          created_at: string | null
          id: number
          meal_plan_id: number
          meal_time: string | null
          meal_type: Database["public"]["Enums"]["meal_type_enum"]
          name: string
          notes: string | null
          order_index: number | null
          total_calories: number | null
          total_carbs: number | null
          total_fat: number | null
          total_protein: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          meal_plan_id: number
          meal_time?: string | null
          meal_type: Database["public"]["Enums"]["meal_type_enum"]
          name: string
          notes?: string | null
          order_index?: number | null
          total_calories?: number | null
          total_carbs?: number | null
          total_fat?: number | null
          total_protein?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          meal_plan_id?: number
          meal_time?: string | null
          meal_type?: Database["public"]["Enums"]["meal_type_enum"]
          name?: string
          notes?: string | null
          order_index?: number | null
          total_calories?: number | null
          total_carbs?: number | null
          total_fat?: number | null
          total_protein?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_meals_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plan_reference_values: {
        Row: {
          carbs_g_per_kg: number | null
          carbs_percentage: number | null
          created_at: string | null
          energy_source: string | null
          fat_g_per_kg: number | null
          fat_percentage: number | null
          id: number
          macro_mode: string | null
          meal_plan_id: number
          protein_g_per_kg: number | null
          protein_percentage: number | null
          target_carbs_g: number | null
          target_fat_g: number | null
          target_protein_g: number | null
          total_energy_kcal: number | null
          updated_at: string | null
          weight_kg: number | null
          weight_type: string | null
        }
        Insert: {
          carbs_g_per_kg?: number | null
          carbs_percentage?: number | null
          created_at?: string | null
          energy_source?: string | null
          fat_g_per_kg?: number | null
          fat_percentage?: number | null
          id?: number
          macro_mode?: string | null
          meal_plan_id: number
          protein_g_per_kg?: number | null
          protein_percentage?: number | null
          target_carbs_g?: number | null
          target_fat_g?: number | null
          target_protein_g?: number | null
          total_energy_kcal?: number | null
          updated_at?: string | null
          weight_kg?: number | null
          weight_type?: string | null
        }
        Update: {
          carbs_g_per_kg?: number | null
          carbs_percentage?: number | null
          created_at?: string | null
          energy_source?: string | null
          fat_g_per_kg?: number | null
          fat_percentage?: number | null
          id?: number
          macro_mode?: string | null
          meal_plan_id?: number
          protein_g_per_kg?: number | null
          protein_percentage?: number | null
          target_carbs_g?: number | null
          target_fat_g?: number | null
          target_protein_g?: number | null
          total_energy_kcal?: number | null
          updated_at?: string | null
          weight_kg?: number | null
          weight_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_reference_values_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: true
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plan_versions: {
        Row: {
          change_reason: string | null
          created_at: string
          created_by: string | null
          id: number
          is_rollback: boolean
          meal_plan_id: number
          metadata: Json
          nutritionist_id: string
          patient_id: string
          snapshot: Json
          version_number: number
        }
        Insert: {
          change_reason?: string | null
          created_at?: string
          created_by?: string | null
          id?: number
          is_rollback?: boolean
          meal_plan_id: number
          metadata?: Json
          nutritionist_id: string
          patient_id: string
          snapshot?: Json
          version_number?: number
        }
        Update: {
          change_reason?: string | null
          created_at?: string
          created_by?: string | null
          id?: number
          is_rollback?: boolean
          meal_plan_id?: number
          metadata?: Json
          nutritionist_id?: string
          patient_id?: string
          snapshot?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_versions_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plans: {
        Row: {
          active_days: Json
          care_episode_id: string | null
          created_at: string | null
          daily_calories: number | null
          daily_carbs: number | null
          daily_fat: number | null
          daily_protein: number | null
          description: string | null
          end_date: string | null
          id: number
          is_active: boolean | null
          is_draft: boolean
          is_template: boolean | null
          name: string
          nutritionist_id: string
          patient_id: string | null
          start_date: string | null
          template_tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          active_days?: Json
          care_episode_id?: string | null
          created_at?: string | null
          daily_calories?: number | null
          daily_carbs?: number | null
          daily_fat?: number | null
          daily_protein?: number | null
          description?: string | null
          end_date?: string | null
          id?: number
          is_active?: boolean | null
          is_draft?: boolean
          is_template?: boolean | null
          name: string
          nutritionist_id: string
          patient_id?: string | null
          start_date?: string | null
          template_tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          active_days?: Json
          care_episode_id?: string | null
          created_at?: string | null
          daily_calories?: number | null
          daily_carbs?: number | null
          daily_fat?: number | null
          daily_protein?: number | null
          description?: string | null
          end_date?: string | null
          id?: number
          is_active?: boolean | null
          is_draft?: boolean
          is_template?: boolean | null
          name?: string
          nutritionist_id?: string
          patient_id?: string | null
          start_date?: string | null
          template_tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_plans_care_episode_id_fkey"
            columns: ["care_episode_id"]
            isOneToOne: false
            referencedRelation: "care_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plans_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "meal_plans_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plans_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "meal_plans_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_template_food_substitutions: {
        Row: {
          created_at: string | null
          id: string
          quantity: number | null
          substitute_food_id: string | null
          template_food_id: string | null
          unit: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          quantity?: number | null
          substitute_food_id?: string | null
          template_food_id?: string | null
          unit?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          quantity?: number | null
          substitute_food_id?: string | null
          template_food_id?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_template_food_substitutions_template_food_id_fkey"
            columns: ["template_food_id"]
            isOneToOne: false
            referencedRelation: "meal_template_foods"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_template_foods: {
        Row: {
          created_at: string | null
          food_id: string | null
          id: string
          meal_template_id: string | null
          observation: string | null
          order_index: number
          quantity: number
          unit: string | null
        }
        Insert: {
          created_at?: string | null
          food_id?: string | null
          id?: string
          meal_template_id?: string | null
          observation?: string | null
          order_index?: number
          quantity: number
          unit?: string | null
        }
        Update: {
          created_at?: string | null
          food_id?: string | null
          id?: string
          meal_template_id?: string | null
          observation?: string | null
          order_index?: number
          quantity?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_template_foods_meal_template_id_fkey"
            columns: ["meal_template_id"]
            isOneToOne: false
            referencedRelation: "meal_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_templates: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          tags: string[] | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          tags?: string[] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          tags?: string[] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      meals: {
        Row: {
          adherence_score: number | null
          care_episode_id: string | null
          created_at: string | null
          deleted_at: string | null
          id: number
          is_edited: boolean | null
          meal_date: string
          meal_plan_id: number | null
          meal_plan_meal_id: number | null
          meal_time: string
          meal_type: string
          notes: string | null
          patient_id: string
          photo_url: string | null
          total_calories: number
          total_carbs: number
          total_fat: number
          total_protein: number
          updated_at: string | null
        }
        Insert: {
          adherence_score?: number | null
          care_episode_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: never
          is_edited?: boolean | null
          meal_date: string
          meal_plan_id?: number | null
          meal_plan_meal_id?: number | null
          meal_time: string
          meal_type: string
          notes?: string | null
          patient_id: string
          photo_url?: string | null
          total_calories: number
          total_carbs: number
          total_fat: number
          total_protein: number
          updated_at?: string | null
        }
        Update: {
          adherence_score?: number | null
          care_episode_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: never
          is_edited?: boolean | null
          meal_date?: string
          meal_plan_id?: number | null
          meal_plan_meal_id?: number | null
          meal_time?: string
          meal_type?: string
          notes?: string | null
          patient_id?: string
          photo_url?: string | null
          total_calories?: number
          total_carbs?: number
          total_fat?: number
          total_protein?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meals_care_episode_id_fkey"
            columns: ["care_episode_id"]
            isOneToOne: false
            referencedRelation: "care_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meals_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meals_meal_plan_meal_id_fkey"
            columns: ["meal_plan_meal_id"]
            isOneToOne: false
            referencedRelation: "meal_plan_meals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meals_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "meals_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          body_template: string
          channel: string
          context: string
          created_at: string
          id: number
          is_active: boolean
          last_used_at: string | null
          metadata: Json
          name: string
          nutritionist_id: string | null
          template_key: string
          title_template: string | null
          updated_at: string
          use_count: number
          variables: Json
        }
        Insert: {
          body_template: string
          channel?: string
          context?: string
          created_at?: string
          id?: number
          is_active?: boolean
          last_used_at?: string | null
          metadata?: Json
          name: string
          nutritionist_id?: string | null
          template_key: string
          title_template?: string | null
          updated_at?: string
          use_count?: number
          variables?: Json
        }
        Update: {
          body_template?: string
          channel?: string
          context?: string
          created_at?: string
          id?: number
          is_active?: boolean
          last_used_at?: string | null
          metadata?: Json
          name?: string
          nutritionist_id?: string | null
          template_key?: string
          title_template?: string | null
          updated_at?: string
          use_count?: number
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "message_templates_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_events: {
        Row: {
          actor_id: string | null
          event_type: string
          id: number
          notification_id: number
          occurred_at: string
          snapshot: Json
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          event_type: string
          id?: number
          notification_id: number
          occurred_at?: string
          snapshot: Json
          user_id: string
        }
        Update: {
          actor_id?: string | null
          event_type?: string
          id?: number
          notification_id?: number
          occurred_at?: string
          snapshot?: Json
          user_id?: string
        }
        Relationships: []
      }
      notification_rules: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_active: boolean
          nutritionist_id: string | null
          rule_key: string
          scope: string
          updated_at: string
          weight: number
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          nutritionist_id?: string | null
          rule_key: string
          scope?: string
          updated_at?: string
          weight?: number
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          nutritionist_id?: string | null
          rule_key?: string
          scope?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "notification_rules_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "notification_rules_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          content: Json | null
          created_at: string | null
          id: number
          is_read: boolean | null
          link_url: string | null
          message: string | null
          read_at: string | null
          title: string | null
          type: string
          user_id: string
        }
        Insert: {
          content?: Json | null
          created_at?: string | null
          id?: never
          is_read?: boolean | null
          link_url?: string | null
          message?: string | null
          read_at?: string | null
          title?: string | null
          type: string
          user_id: string
        }
        Update: {
          content?: Json | null
          created_at?: string | null
          id?: never
          is_read?: boolean | null
          link_url?: string | null
          message?: string | null
          read_at?: string | null
          title?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      nutritionist_branding: {
        Row: {
          accent_color: string | null
          clinic_name: string | null
          cover_image_url: string | null
          created_at: string | null
          id: string
          logo_url: string | null
          nutritionist_id: string
          primary_color: string | null
          updated_at: string | null
          welcome_message: string | null
        }
        Insert: {
          accent_color?: string | null
          clinic_name?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          nutritionist_id: string
          primary_color?: string | null
          updated_at?: string | null
          welcome_message?: string | null
        }
        Update: {
          accent_color?: string | null
          clinic_name?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          nutritionist_id?: string
          primary_color?: string | null
          updated_at?: string | null
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nutritionist_branding_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: true
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "nutritionist_branding_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: true
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nutritionist_custom_measures: {
        Row: {
          category: string
          code: string
          created_at: string
          description: string | null
          grams_equivalent: number
          id: number
          is_active: boolean
          name: string
          nutritionist_id: string
          order_index: number
          updated_at: string
        }
        Insert: {
          category?: string
          code: string
          created_at?: string
          description?: string | null
          grams_equivalent: number
          id?: number
          is_active?: boolean
          name: string
          nutritionist_id: string
          order_index?: number
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          description?: string | null
          grams_equivalent?: number
          id?: number
          is_active?: boolean
          name?: string
          nutritionist_id?: string
          order_index?: number
          updated_at?: string
        }
        Relationships: []
      }
      nutritionist_foods: {
        Row: {
          barcode: string | null
          base_qty: number | null
          base_unit: string | null
          brand: string | null
          calcium_mg: number | null
          carbohydrate_g: number | null
          cholesterol_mg: number | null
          created_at: string | null
          energy_kcal: number | null
          fiber_g: number | null
          folate_mcg: number | null
          id: string
          iron_mg: number | null
          is_active: boolean | null
          lipid_g: number | null
          magnesium_mg: number | null
          monounsaturated_fat_g: number | null
          name: string
          nutritionist_id: string
          phosphorus_mg: number | null
          polyunsaturated_fat_g: number | null
          potassium_mg: number | null
          protein_g: number | null
          saturated_fat_g: number | null
          sodium_mg: number | null
          sugar_g: number | null
          trans_fat_g: number | null
          vitamin_a_mcg: number | null
          vitamin_b12_mcg: number | null
          vitamin_c_mg: number | null
          vitamin_d_mcg: number | null
          vitamin_e_mg: number | null
          zinc_mg: number | null
        }
        Insert: {
          barcode?: string | null
          base_qty?: number | null
          base_unit?: string | null
          brand?: string | null
          calcium_mg?: number | null
          carbohydrate_g?: number | null
          cholesterol_mg?: number | null
          created_at?: string | null
          energy_kcal?: number | null
          fiber_g?: number | null
          folate_mcg?: number | null
          id?: string
          iron_mg?: number | null
          is_active?: boolean | null
          lipid_g?: number | null
          magnesium_mg?: number | null
          monounsaturated_fat_g?: number | null
          name: string
          nutritionist_id: string
          phosphorus_mg?: number | null
          polyunsaturated_fat_g?: number | null
          potassium_mg?: number | null
          protein_g?: number | null
          saturated_fat_g?: number | null
          sodium_mg?: number | null
          sugar_g?: number | null
          trans_fat_g?: number | null
          vitamin_a_mcg?: number | null
          vitamin_b12_mcg?: number | null
          vitamin_c_mg?: number | null
          vitamin_d_mcg?: number | null
          vitamin_e_mg?: number | null
          zinc_mg?: number | null
        }
        Update: {
          barcode?: string | null
          base_qty?: number | null
          base_unit?: string | null
          brand?: string | null
          calcium_mg?: number | null
          carbohydrate_g?: number | null
          cholesterol_mg?: number | null
          created_at?: string | null
          energy_kcal?: number | null
          fiber_g?: number | null
          folate_mcg?: number | null
          id?: string
          iron_mg?: number | null
          is_active?: boolean | null
          lipid_g?: number | null
          magnesium_mg?: number | null
          monounsaturated_fat_g?: number | null
          name?: string
          nutritionist_id?: string
          phosphorus_mg?: number | null
          polyunsaturated_fat_g?: number | null
          potassium_mg?: number | null
          protein_g?: number | null
          saturated_fat_g?: number | null
          sodium_mg?: number | null
          sugar_g?: number | null
          trans_fat_g?: number | null
          vitamin_a_mcg?: number | null
          vitamin_b12_mcg?: number | null
          vitamin_c_mg?: number | null
          vitamin_d_mcg?: number | null
          vitamin_e_mg?: number | null
          zinc_mg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nutritionist_foods_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "nutritionist_foods_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nutritionist_patients: {
        Row: {
          app_settings: Json | null
          checkin_streak_best: number | null
          checkin_streak_current: number | null
          created_at: string | null
          engagement_level: string | null
          id: string
          last_checkin_at: string | null
          level_name: string | null
          nutritionist_id: string
          onboarding_completed: boolean | null
          patient_id: string
          plan_expires_at: string | null
          status: string | null
          tags: string[] | null
          xp_points: number | null
        }
        Insert: {
          app_settings?: Json | null
          checkin_streak_best?: number | null
          checkin_streak_current?: number | null
          created_at?: string | null
          engagement_level?: string | null
          id?: string
          last_checkin_at?: string | null
          level_name?: string | null
          nutritionist_id: string
          onboarding_completed?: boolean | null
          patient_id: string
          plan_expires_at?: string | null
          status?: string | null
          tags?: string[] | null
          xp_points?: number | null
        }
        Update: {
          app_settings?: Json | null
          checkin_streak_best?: number | null
          checkin_streak_current?: number | null
          created_at?: string | null
          engagement_level?: string | null
          id?: string
          last_checkin_at?: string | null
          level_name?: string | null
          nutritionist_id?: string
          onboarding_completed?: boolean | null
          patient_id?: string
          plan_expires_at?: string | null
          status?: string | null
          tags?: string[] | null
          xp_points?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nutritionist_patients_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "nutritionist_patients_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutritionist_patients_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "nutritionist_patients_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_observability_log: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          id: number
          latency_ms: number
          metadata: Json
          module: string
          nutritionist_id: string | null
          operation: string
          patient_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: number
          latency_ms?: number
          metadata?: Json
          module: string
          nutritionist_id?: string | null
          operation: string
          patient_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: number
          latency_ms?: number
          metadata?: Json
          module?: string
          nutritionist_id?: string | null
          operation?: string
          patient_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operational_observability_log_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "operational_observability_log_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_observability_log_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "operational_observability_log_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_episode_legal_guardians: {
        Row: {
          author_id: string
          care_episode_id: string
          consent: Json
          contact: Json
          cpf_fingerprint: string | null
          cpf_last4: string | null
          created_at: string
          id: string
          is_primary: boolean
          name: string
          patient_id: string
          relationship: string
          status: string
          updated_at: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          author_id: string
          care_episode_id: string
          consent?: Json
          contact?: Json
          cpf_fingerprint?: string | null
          cpf_last4?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          name: string
          patient_id: string
          relationship: string
          status?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          author_id?: string
          care_episode_id?: string
          consent?: Json
          contact?: Json
          cpf_fingerprint?: string | null
          cpf_last4?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          name?: string
          patient_id?: string
          relationship?: string
          status?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_guardians_episode_patient_fk"
            columns: ["care_episode_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "care_episodes"
            referencedColumns: ["id", "patient_id"]
          },
          {
            foreignKeyName: "patient_episode_legal_guardians_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "patient_episode_legal_guardians_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_episode_legal_guardians_care_episode_id_fkey"
            columns: ["care_episode_id"]
            isOneToOne: false
            referencedRelation: "care_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_episode_legal_guardians_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "patient_episode_legal_guardians_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_goals: {
        Row: {
          care_episode_id: string | null
          completion_date: string | null
          created_at: string | null
          current_weight: number | null
          daily_calorie_goal: number | null
          description: string | null
          energy_expenditure_id: number | null
          goal_type: string
          id: number
          initial_weight: number
          is_realistic: boolean | null
          meal_plan_id: number | null
          nutritionist_id: string
          patient_id: string
          progress_percentage: number | null
          required_daily_deficit: number | null
          start_date: string
          status: string
          target_date: string
          target_weight: number
          title: string
          updated_at: string | null
          viability_notes: string | null
          viability_score: number | null
          warnings: Json | null
        }
        Insert: {
          care_episode_id?: string | null
          completion_date?: string | null
          created_at?: string | null
          current_weight?: number | null
          daily_calorie_goal?: number | null
          description?: string | null
          energy_expenditure_id?: number | null
          goal_type: string
          id?: number
          initial_weight: number
          is_realistic?: boolean | null
          meal_plan_id?: number | null
          nutritionist_id: string
          patient_id: string
          progress_percentage?: number | null
          required_daily_deficit?: number | null
          start_date?: string
          status?: string
          target_date: string
          target_weight: number
          title: string
          updated_at?: string | null
          viability_notes?: string | null
          viability_score?: number | null
          warnings?: Json | null
        }
        Update: {
          care_episode_id?: string | null
          completion_date?: string | null
          created_at?: string | null
          current_weight?: number | null
          daily_calorie_goal?: number | null
          description?: string | null
          energy_expenditure_id?: number | null
          goal_type?: string
          id?: number
          initial_weight?: number
          is_realistic?: boolean | null
          meal_plan_id?: number | null
          nutritionist_id?: string
          patient_id?: string
          progress_percentage?: number | null
          required_daily_deficit?: number | null
          start_date?: string
          status?: string
          target_date?: string
          target_weight?: number
          title?: string
          updated_at?: string | null
          viability_notes?: string | null
          viability_score?: number | null
          warnings?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_goals_care_episode_id_fkey"
            columns: ["care_episode_id"]
            isOneToOne: false
            referencedRelation: "care_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_goals_energy_expenditure_id_fkey"
            columns: ["energy_expenditure_id"]
            isOneToOne: false
            referencedRelation: "energy_expenditure_calculations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_goals_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_module_sync_flags: {
        Row: {
          anthropometry_updated_at: string | null
          needs_energy_recalc: boolean
          needs_meal_plan_review: boolean
          patient_id: string
          updated_at: string
        }
        Insert: {
          anthropometry_updated_at?: string | null
          needs_energy_recalc?: boolean
          needs_meal_plan_review?: boolean
          patient_id: string
          updated_at?: string
        }
        Update: {
          anthropometry_updated_at?: string | null
          needs_energy_recalc?: boolean
          needs_meal_plan_review?: boolean
          patient_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_module_sync_flags_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: true
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "patient_module_sync_flags_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: true
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_profile_events: {
        Row: {
          actor_id: string
          care_episode_id: string | null
          created_at: string
          field_name: string
          id: string
          new_value: Json | null
          occurred_at: string
          patient_id: string
          previous_value: Json | null
          source: string
        }
        Insert: {
          actor_id: string
          care_episode_id?: string | null
          created_at?: string
          field_name: string
          id?: string
          new_value?: Json | null
          occurred_at?: string
          patient_id: string
          previous_value?: Json | null
          source: string
        }
        Update: {
          actor_id?: string
          care_episode_id?: string | null
          created_at?: string
          field_name?: string
          id?: string
          new_value?: Json | null
          occurred_at?: string
          patient_id?: string
          previous_value?: Json | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_profile_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "patient_profile_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_profile_events_care_episode_id_fkey"
            columns: ["care_episode_id"]
            isOneToOne: false
            referencedRelation: "care_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_profile_events_episode_patient_fk"
            columns: ["care_episode_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "care_episodes"
            referencedColumns: ["id", "patient_id"]
          },
          {
            foreignKeyName: "patient_profile_events_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "patient_profile_events_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_reminder_preferences: {
        Row: {
          channel_in_app: boolean
          created_at: string
          daily_log_enabled: boolean
          daily_log_time: string
          id: number
          measurement_enabled: boolean
          measurement_time: string
          patient_id: string
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          channel_in_app?: boolean
          created_at?: string
          daily_log_enabled?: boolean
          daily_log_time?: string
          id?: number
          measurement_enabled?: boolean
          measurement_time?: string
          patient_id: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          channel_in_app?: boolean
          created_at?: string
          daily_log_enabled?: boolean
          daily_log_time?: string
          id?: number
          measurement_enabled?: boolean
          measurement_time?: string
          patient_id?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_reminder_preferences_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: true
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "patient_reminder_preferences_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: true
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      prescriptions: {
        Row: {
          calories: number
          carbs: number
          care_episode_id: string | null
          created_at: string | null
          diet_type: string | null
          end_date: string
          fat: number
          id: number
          meal_plan: Json | null
          notes: string | null
          nutritionist_id: string
          patient_id: string
          protein: number
          start_date: string
        }
        Insert: {
          calories: number
          carbs: number
          care_episode_id?: string | null
          created_at?: string | null
          diet_type?: string | null
          end_date: string
          fat: number
          id?: never
          meal_plan?: Json | null
          notes?: string | null
          nutritionist_id: string
          patient_id: string
          protein: number
          start_date: string
        }
        Update: {
          calories?: number
          carbs?: number
          care_episode_id?: string | null
          created_at?: string | null
          diet_type?: string | null
          end_date?: string
          fat?: number
          id?: never
          meal_plan?: Json | null
          notes?: string | null
          nutritionist_id?: string
          patient_id?: string
          protein?: number
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_care_episode_id_fkey"
            columns: ["care_episode_id"]
            isOneToOne: false
            referencedRelation: "care_episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_verifications: {
        Row: {
          created_at: string
          crn_number: string | null
          crn_region: string | null
          current_semester: number | null
          decision_reason: string | null
          document_required_reason: string | null
          expected_graduation_at: string | null
          id: string
          institution_name: string | null
          normalized_crn: string | null
          professional_role: string
          reviewed_at: string | null
          reviewed_by: string | null
          source_checked_at: string | null
          source_url: string | null
          status: string
          submitted_at: string | null
          updated_at: string
          user_id: string
          valid_until: string | null
          verification_method: string | null
        }
        Insert: {
          created_at?: string
          crn_number?: string | null
          crn_region?: string | null
          current_semester?: number | null
          decision_reason?: string | null
          document_required_reason?: string | null
          expected_graduation_at?: string | null
          id?: string
          institution_name?: string | null
          normalized_crn?: string | null
          professional_role: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_checked_at?: string | null
          source_url?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id: string
          valid_until?: string | null
          verification_method?: string | null
        }
        Update: {
          created_at?: string
          crn_number?: string | null
          crn_region?: string | null
          current_semester?: number | null
          decision_reason?: string | null
          document_required_reason?: string | null
          expected_graduation_at?: string | null
          id?: string
          institution_name?: string | null
          normalized_crn?: string | null
          professional_role?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_checked_at?: string | null
          source_url?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
          valid_until?: string | null
          verification_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "professional_verifications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "professional_verifications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_verifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "professional_verifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      progress_photo_events: {
        Row: {
          actor_id: string | null
          after_state: Json | null
          before_state: Json | null
          care_episode_id: string | null
          event_type: string
          id: number
          occurred_at: string
          patient_id: string
          progress_photo_id: string
        }
        Insert: {
          actor_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          care_episode_id?: string | null
          event_type: string
          id?: number
          occurred_at?: string
          patient_id: string
          progress_photo_id: string
        }
        Update: {
          actor_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          care_episode_id?: string | null
          event_type?: string
          id?: number
          occurred_at?: string
          patient_id?: string
          progress_photo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "progress_photo_events_care_episode_id_fkey"
            columns: ["care_episode_id"]
            isOneToOne: false
            referencedRelation: "care_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_photo_events_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "progress_photo_events_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_photo_events_progress_photo_id_fkey"
            columns: ["progress_photo_id"]
            isOneToOne: false
            referencedRelation: "progress_photos"
            referencedColumns: ["id"]
          },
        ]
      }
      progress_photos: {
        Row: {
          care_episode_id: string | null
          created_at: string
          id: string
          invalidated_at: string | null
          invalidated_by: string | null
          invalidation_reason: string | null
          notes: string | null
          patient_id: string
          photo_date: string
          photo_url: string
          status: string
          storage_path: string | null
          uploaded_by: string | null
        }
        Insert: {
          care_episode_id?: string | null
          created_at?: string
          id?: string
          invalidated_at?: string | null
          invalidated_by?: string | null
          invalidation_reason?: string | null
          notes?: string | null
          patient_id: string
          photo_date: string
          photo_url: string
          status?: string
          storage_path?: string | null
          uploaded_by?: string | null
        }
        Update: {
          care_episode_id?: string | null
          created_at?: string
          id?: string
          invalidated_at?: string | null
          invalidated_by?: string | null
          invalidation_reason?: string | null
          notes?: string | null
          patient_id?: string
          photo_date?: string
          photo_url?: string
          status?: string
          storage_path?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "progress_photos_care_episode_id_fkey"
            columns: ["care_episode_id"]
            isOneToOne: false
            referencedRelation: "care_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_photos_invalidated_by_fkey"
            columns: ["invalidated_by"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "progress_photos_invalidated_by_fkey"
            columns: ["invalidated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_photos_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "progress_photos_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "progress_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          created_at: string | null
          food_id: string | null
          id: string
          quantity: number
          recipe_id: string | null
          unit: string | null
        }
        Insert: {
          created_at?: string | null
          food_id?: string | null
          id?: string
          quantity: number
          recipe_id?: string | null
          unit?: string | null
        }
        Update: {
          created_at?: string | null
          food_id?: string | null
          id?: string
          quantity?: number
          recipe_id?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          base_calories: number | null
          base_carbs: number | null
          base_fat: number | null
          base_protein: number | null
          created_at: string | null
          description: string | null
          id: string
          is_deleted: boolean | null
          name: string
          preparation_method: string | null
          updated_at: string | null
          user_id: string | null
          yield_quantity: number
          yield_unit: string
        }
        Insert: {
          base_calories?: number | null
          base_carbs?: number | null
          base_fat?: number | null
          base_protein?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_deleted?: boolean | null
          name: string
          preparation_method?: string | null
          updated_at?: string | null
          user_id?: string | null
          yield_quantity: number
          yield_unit: string
        }
        Update: {
          base_calories?: number | null
          base_carbs?: number | null
          base_fat?: number | null
          base_protein?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_deleted?: boolean | null
          name?: string
          preparation_method?: string | null
          updated_at?: string | null
          user_id?: string | null
          yield_quantity?: number
          yield_unit?: string
        }
        Relationships: []
      }
      recurring_expenses: {
        Row: {
          active: boolean | null
          amount: number
          category: string | null
          created_at: string | null
          day_of_month: number
          description: string
          id: string
          nutritionist_id: string
        }
        Insert: {
          active?: boolean | null
          amount: number
          category?: string | null
          created_at?: string | null
          day_of_month: number
          description: string
          id?: string
          nutritionist_id: string
        }
        Update: {
          active?: boolean | null
          amount?: number
          category?: string | null
          created_at?: string | null
          day_of_month?: number
          description?: string
          id?: string
          nutritionist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expenses_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "recurring_expenses_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_foods: {
        Row: {
          base_unit: string | null
          calcium: number | null
          calories: number | null
          carbs: number | null
          cholesterol: number | null
          created_at: string | null
          description: string | null
          fat: number | null
          fiber: number | null
          folate: number | null
          group: string | null
          group_norm: string | null
          id: string
          iron: number | null
          is_active: boolean | null
          magnesium: number | null
          monounsaturated_fat: number | null
          name: string
          nutritionist_id: string | null
          phosphorus: number | null
          polyunsaturated_fat: number | null
          portion_size: number | null
          potassium: number | null
          preparation: string | null
          protein: number | null
          saturated_fat: number | null
          sodium: number | null
          source: Database["public"]["Enums"]["food_source"]
          source_id: string
          sugar: number | null
          trans_fat: number | null
          vitamin_a: number | null
          vitamin_b12: number | null
          vitamin_c: number | null
          vitamin_d: number | null
          vitamin_e: number | null
          zinc: number | null
        }
        Insert: {
          base_unit?: string | null
          calcium?: number | null
          calories?: number | null
          carbs?: number | null
          cholesterol?: number | null
          created_at?: string | null
          description?: string | null
          fat?: number | null
          fiber?: number | null
          folate?: number | null
          group?: string | null
          group_norm?: string | null
          id?: string
          iron?: number | null
          is_active?: boolean | null
          magnesium?: number | null
          monounsaturated_fat?: number | null
          name: string
          nutritionist_id?: string | null
          phosphorus?: number | null
          polyunsaturated_fat?: number | null
          portion_size?: number | null
          potassium?: number | null
          preparation?: string | null
          protein?: number | null
          saturated_fat?: number | null
          sodium?: number | null
          source: Database["public"]["Enums"]["food_source"]
          source_id: string
          sugar?: number | null
          trans_fat?: number | null
          vitamin_a?: number | null
          vitamin_b12?: number | null
          vitamin_c?: number | null
          vitamin_d?: number | null
          vitamin_e?: number | null
          zinc?: number | null
        }
        Update: {
          base_unit?: string | null
          calcium?: number | null
          calories?: number | null
          carbs?: number | null
          cholesterol?: number | null
          created_at?: string | null
          description?: string | null
          fat?: number | null
          fiber?: number | null
          folate?: number | null
          group?: string | null
          group_norm?: string | null
          id?: string
          iron?: number | null
          is_active?: boolean | null
          magnesium?: number | null
          monounsaturated_fat?: number | null
          name?: string
          nutritionist_id?: string | null
          phosphorus?: number | null
          polyunsaturated_fat?: number | null
          portion_size?: number | null
          potassium?: number | null
          preparation?: string | null
          protein?: number | null
          saturated_fat?: number | null
          sodium?: number | null
          source?: Database["public"]["Enums"]["food_source"]
          source_id?: string
          sugar?: number | null
          trans_fat?: number | null
          vitamin_a?: number | null
          vitamin_b12?: number | null
          vitamin_c?: number | null
          vitamin_d?: number | null
          vitamin_e?: number | null
          zinc?: number | null
        }
        Relationships: []
      }
      reminder_delivery_log: {
        Row: {
          created_at: string
          delivery_channel: string
          id: number
          metadata: Json
          notification_id: number | null
          patient_id: string
          reminder_date: string
          reminder_time: string
          reminder_type: string
          status: string
        }
        Insert: {
          created_at?: string
          delivery_channel?: string
          id?: number
          metadata?: Json
          notification_id?: number | null
          patient_id: string
          reminder_date: string
          reminder_time: string
          reminder_type: string
          status?: string
        }
        Update: {
          created_at?: string
          delivery_channel?: string
          id?: number
          metadata?: Json
          notification_id?: number | null
          patient_id?: string
          reminder_date?: string
          reminder_time?: string
          reminder_type?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_delivery_log_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_delivery_log_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "reminder_delivery_log_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean | null
          created_at: string | null
          duration_minutes: number | null
          id: string
          name: string
          nutritionist_id: string
          price: number
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          name: string
          nutritionist_id: string
          price: number
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          name?: string
          nutritionist_id?: string
          price?: number
        }
        Relationships: [
          {
            foreignKeyName: "services_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "services_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_supervision_events: {
        Row: {
          actor_id: string
          created_at: string
          from_status: string | null
          id: string
          reason: string
          student_id: string
          supervision_id: string
          supervisor_id: string
          to_status: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          from_status?: string | null
          id?: string
          reason: string
          student_id: string
          supervision_id: string
          supervisor_id: string
          to_status: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          from_status?: string | null
          id?: string
          reason?: string
          student_id?: string
          supervision_id?: string
          supervisor_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_supervision_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "student_supervision_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_supervision_events_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "student_supervision_events_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_supervision_events_supervision_id_fkey"
            columns: ["supervision_id"]
            isOneToOne: false
            referencedRelation: "student_supervisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_supervision_events_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "student_supervision_events_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_supervisions: {
        Row: {
          created_at: string
          end_reason: string | null
          ended_at: string | null
          id: string
          requested_at: string
          responded_at: string | null
          response_reason: string | null
          started_at: string | null
          status: string
          student_id: string
          supervisor_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          requested_at?: string
          responded_at?: string | null
          response_reason?: string | null
          started_at?: string | null
          status?: string
          student_id: string
          supervisor_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          requested_at?: string
          responded_at?: string | null
          response_reason?: string | null
          started_at?: string | null
          status?: string
          student_id?: string
          supervisor_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_supervisions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "student_supervisions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_supervisions_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "student_supervisions_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      supplement_logs: {
        Row: {
          care_episode_id: string | null
          created_at: string | null
          dose_mg: number | null
          id: string
          notes: string | null
          nutritionist_id: string | null
          patient_id: string
          supplement_name: string
          taken_at: string | null
          timing: string | null
        }
        Insert: {
          care_episode_id?: string | null
          created_at?: string | null
          dose_mg?: number | null
          id?: string
          notes?: string | null
          nutritionist_id?: string | null
          patient_id: string
          supplement_name: string
          taken_at?: string | null
          timing?: string | null
        }
        Update: {
          care_episode_id?: string | null
          created_at?: string | null
          dose_mg?: number | null
          id?: string
          notes?: string | null
          nutritionist_id?: string | null
          patient_id?: string
          supplement_name?: string
          taken_at?: string | null
          timing?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplement_logs_care_episode_id_fkey"
            columns: ["care_episode_id"]
            isOneToOne: false
            referencedRelation: "care_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplement_logs_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "supplement_logs_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplement_logs_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "supplement_logs_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      template_dispatch_log: {
        Row: {
          channel: string
          created_at: string
          delivery_status: string
          error_message: string | null
          id: number
          metadata: Json
          nutritionist_id: string
          patient_id: string
          rendered_body: string
          rendered_title: string | null
          template_id: number
          trigger_event: string | null
          variables_used: Json
        }
        Insert: {
          channel?: string
          created_at?: string
          delivery_status?: string
          error_message?: string | null
          id?: number
          metadata?: Json
          nutritionist_id: string
          patient_id: string
          rendered_body: string
          rendered_title?: string | null
          template_id: number
          trigger_event?: string | null
          variables_used?: Json
        }
        Update: {
          channel?: string
          created_at?: string
          delivery_status?: string
          error_message?: string | null
          id?: number
          metadata?: Json
          nutritionist_id?: string
          patient_id?: string
          rendered_body?: string
          rendered_title?: string | null
          template_id?: number
          trigger_event?: string | null
          variables_used?: Json
        }
        Relationships: [
          {
            foreignKeyName: "template_dispatch_log_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "template_dispatch_log_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_dispatch_log_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "template_dispatch_log_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_dispatch_log_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_achievements: {
        Row: {
          achieved_at: string
          achievement_id: number
          id: number
          user_id: string
        }
        Insert: {
          achieved_at?: string
          achievement_id: number
          id?: never
          user_id: string
        }
        Update: {
          achieved_at?: string
          achievement_id?: number
          id?: never
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          address: Json | null
          avatar_url: string | null
          bio: string | null
          birth_date: string | null
          civil_status: string | null
          clinic_settings: Json | null
          clinical_flags: Json
          cpf: string | null
          created_at: string | null
          crn: string | null
          education: string | null
          email: string | null
          ethnicity: string | null
          fiscal_data: Json | null
          gender: string | null
          goal: string | null
          height: number | null
          id: string
          invite_code: string | null
          is_active: boolean | null
          is_admin: boolean | null
          is_simulation: boolean
          last_seen_at: string | null
          name: string
          needs_password_reset: boolean | null
          nutritionist_id: string | null
          observations: string | null
          occupation: string | null
          patient_category: string | null
          patient_invite_code: string | null
          phone: string | null
          preferences: Json | null
          simulation_owner_id: string | null
          slug: string | null
          specialties: string[] | null
          user_type: string
          weight: number | null
        }
        Insert: {
          address?: Json | null
          avatar_url?: string | null
          bio?: string | null
          birth_date?: string | null
          civil_status?: string | null
          clinic_settings?: Json | null
          clinical_flags?: Json
          cpf?: string | null
          created_at?: string | null
          crn?: string | null
          education?: string | null
          email?: string | null
          ethnicity?: string | null
          fiscal_data?: Json | null
          gender?: string | null
          goal?: string | null
          height?: number | null
          id: string
          invite_code?: string | null
          is_active?: boolean | null
          is_admin?: boolean | null
          is_simulation?: boolean
          last_seen_at?: string | null
          name: string
          needs_password_reset?: boolean | null
          nutritionist_id?: string | null
          observations?: string | null
          occupation?: string | null
          patient_category?: string | null
          patient_invite_code?: string | null
          phone?: string | null
          preferences?: Json | null
          simulation_owner_id?: string | null
          slug?: string | null
          specialties?: string[] | null
          user_type: string
          weight?: number | null
        }
        Update: {
          address?: Json | null
          avatar_url?: string | null
          bio?: string | null
          birth_date?: string | null
          civil_status?: string | null
          clinic_settings?: Json | null
          clinical_flags?: Json
          cpf?: string | null
          created_at?: string | null
          crn?: string | null
          education?: string | null
          email?: string | null
          ethnicity?: string | null
          fiscal_data?: Json | null
          gender?: string | null
          goal?: string | null
          height?: number | null
          id?: string
          invite_code?: string | null
          is_active?: boolean | null
          is_admin?: boolean | null
          is_simulation?: boolean
          last_seen_at?: string | null
          name?: string
          needs_password_reset?: boolean | null
          nutritionist_id?: string | null
          observations?: string | null
          occupation?: string | null
          patient_category?: string | null
          patient_invite_code?: string | null
          phone?: string | null
          preferences?: Json | null
          simulation_owner_id?: string | null
          slug?: string | null
          specialties?: string[] | null
          user_type?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_simulation_owner_id_fkey"
            columns: ["simulation_owner_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "user_profiles_simulation_owner_id_fkey"
            columns: ["simulation_owner_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_documents: {
        Row: {
          content_sha256: string
          created_at: string
          deleted_at: string | null
          document_type: string
          id: string
          owner_id: string
          retention_status: string
          scheduled_deletion_at: string | null
          storage_path: string | null
          uploaded_at: string
          verification_id: string
        }
        Insert: {
          content_sha256: string
          created_at?: string
          deleted_at?: string | null
          document_type: string
          id?: string
          owner_id: string
          retention_status?: string
          scheduled_deletion_at?: string | null
          storage_path?: string | null
          uploaded_at?: string
          verification_id: string
        }
        Update: {
          content_sha256?: string
          created_at?: string
          deleted_at?: string | null
          document_type?: string
          id?: string
          owner_id?: string
          retention_status?: string
          scheduled_deletion_at?: string | null
          storage_path?: string | null
          uploaded_at?: string
          verification_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_documents_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "verification_documents_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_documents_verification_id_fkey"
            columns: ["verification_id"]
            isOneToOne: false
            referencedRelation: "professional_verifications"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_events: {
        Row: {
          actor_id: string | null
          created_at: string
          from_status: string | null
          id: string
          metadata: Json
          reason: string
          source_url: string | null
          to_status: string
          verification_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          metadata?: Json
          reason: string
          source_url?: string | null
          to_status: string
          verification_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          metadata?: Json
          reason?: string
          source_url?: string | null
          to_status?: string
          verification_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "verification_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_events_verification_id_fkey"
            columns: ["verification_id"]
            isOneToOne: false
            referencedRelation: "professional_verifications"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_summaries: {
        Row: {
          care_episode_id: string | null
          created_at: string | null
          goals_met: Json | null
          id: number
          notes: string | null
          nutritionist_id: string
          patient_id: string
          updated_at: string | null
          week_start_date: string
        }
        Insert: {
          care_episode_id?: string | null
          created_at?: string | null
          goals_met?: Json | null
          id?: never
          notes?: string | null
          nutritionist_id: string
          patient_id: string
          updated_at?: string | null
          week_start_date: string
        }
        Update: {
          care_episode_id?: string | null
          created_at?: string | null
          goals_met?: Json | null
          id?: never
          notes?: string | null
          nutritionist_id?: string
          patient_id?: string
          updated_at?: string | null
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_summaries_care_episode_id_fkey"
            columns: ["care_episode_id"]
            isOneToOne: false
            referencedRelation: "care_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_summaries_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "weekly_summaries_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_summaries_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "weekly_summaries_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      foods: {
        Row: {
          base_unit: string | null
          calcium: number | null
          calories: number | null
          carbs: number | null
          cholesterol: number | null
          created_at: string | null
          description: string | null
          fat: number | null
          fiber: number | null
          folate: number | null
          group: string | null
          group_norm: string | null
          id: string | null
          iron: number | null
          is_active: boolean | null
          magnesium: number | null
          name: string | null
          nutritionist_id: string | null
          phosphorus: number | null
          portion_size: number | null
          potassium: number | null
          preparation: string | null
          protein: number | null
          saturated_fat: number | null
          sodium: number | null
          source: string | null
          source_id: string | null
          sugar: number | null
          trans_fat: number | null
          vitamin_a: number | null
          vitamin_b12: number | null
          vitamin_c: number | null
          vitamin_d: number | null
          vitamin_e: number | null
          zinc: number | null
        }
        Relationships: []
      }
      patient_hub_summary: {
        Row: {
          address: Json | null
          avatar_url: string | null
          birth_date: string | null
          created_at: string | null
          email: string | null
          formatted_address: string | null
          goal: string | null
          has_achievements: boolean | null
          has_anamnese: boolean | null
          has_anthropometry: boolean | null
          has_meals: boolean | null
          has_prescriptions: boolean | null
          last_appointment: string | null
          latest_metrics: Json | null
          name: string | null
          next_appointment: string | null
          nutritionist_id: string | null
          patient_id: string | null
          phone: string | null
        }
        Insert: {
          address?: Json | null
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string | null
          email?: string | null
          formatted_address?: never
          goal?: string | null
          has_achievements?: never
          has_anamnese?: never
          has_anthropometry?: never
          has_meals?: never
          has_prescriptions?: never
          last_appointment?: never
          latest_metrics?: never
          name?: string | null
          next_appointment?: never
          nutritionist_id?: string | null
          patient_id?: string | null
          phone?: string | null
        }
        Update: {
          address?: Json | null
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string | null
          email?: string | null
          formatted_address?: never
          goal?: string | null
          has_achievements?: never
          has_anamnese?: never
          has_anthropometry?: never
          has_meals?: never
          has_prescriptions?: never
          last_appointment?: never
          latest_metrics?: never
          name?: string | null
          next_appointment?: never
          nutritionist_id?: string | null
          patient_id?: string | null
          phone?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _validate_growth_record_json_section: {
        Args: {
          p_default_max: number
          p_default_min: number
          p_section: Json
          p_section_name: string
        }
        Returns: undefined
      }
      abandon_clinical_record_correction: {
        Args: { p_amendment_id: string; p_reason: string }
        Returns: Json
      }
      add_patient_xp: {
        Args: {
          p_nutritionist_id: string
          p_patient_id: string
          p_reason?: string
          p_xp: number
        }
        Returns: Json
      }
      approve_patient_link: { Args: { p_patient_id: string }; Returns: Json }
      archive_private_evolution_template: {
        Args: { p_template_code: string }
        Returns: Json
      }
      auth_role: { Args: never; Returns: string }
      auth_setting: { Args: { p_name: string }; Returns: string }
      auth_uid: { Args: never; Returns: string }
      calculate_goal_progress: { Args: { goal_id: number }; Returns: number }
      calculate_lab_status: {
        Args: { ref_max: number; ref_min: number; test_value_text: string }
        Returns: string
      }
      calculate_macro_targets: {
        Args: { p_meal_plan_id: number }
        Returns: {
          carbs_g: number
          fat_g: number
          protein_g: number
        }[]
      }
      can_delete_user: { Args: { p_target_id: string }; Returns: boolean }
      change_clinical_attachment_visibility: {
        Args: {
          p_attachment_id: string
          p_reason: string
          p_visibility: string
        }
        Returns: Json
      }
      check_and_grant_achievements: {
        Args: { p_user_id: string }
        Returns: {
          description: string
          icon_name: string
          name: string
        }[]
      }
      check_is_admin: { Args: never; Returns: boolean }
      clear_message_notifications_from_sender: {
        Args: { p_sender_id: string }
        Returns: undefined
      }
      clone_diet_template_to_patient: {
        Args: {
          p_name?: string
          p_nutritionist_id: string
          p_patient_id: string
          p_template_id: string
        }
        Returns: number
      }
      clone_evolution_template: {
        Args: { p_name: string; p_source_code: string }
        Returns: Json
      }
      clone_meal_template_to_plan: {
        Args: {
          p_meal_plan_id: number
          p_meal_template_id: string
          p_meal_time?: string
          p_meal_type: string
        }
        Returns: number
      }
      compare_clinical_record_versions: {
        Args: { p_left_record_id: string; p_right_record_id: string }
        Returns: Json
      }
      confirm_clinical_attachment_replacement: {
        Args: {
          p_attachment_id: string
          p_mime_type: string
          p_reason: string
          p_sha256: string
          p_size_bytes: number
        }
        Returns: Json
      }
      confirm_clinical_attachment_upload: {
        Args: {
          p_attachment_id: string
          p_mime_type: string
          p_sha256: string
          p_size_bytes: number
        }
        Returns: Json
      }
      create_appointment_reminders: { Args: never; Returns: undefined }
      create_clinical_attachment_replacement_intent: {
        Args: {
          p_mime_type: string
          p_original_filename: string
          p_replaces_attachment_id: string
          p_size_bytes: number
        }
        Returns: Json
      }
      create_clinical_attachment_signed_url: {
        Args: { p_attachment_id: string }
        Returns: Json
      }
      create_clinical_attachment_upload_intent: {
        Args: {
          p_care_episode_id: string
          p_category_code: string
          p_clinical_date: string
          p_clinical_record_id: string
          p_description: string
          p_mime_type: string
          p_original_filename: string
          p_patient_id: string
          p_size_bytes: number
        }
        Returns: Json
      }
      create_clinical_evolution_draft: {
        Args: {
          p_encounter_at: string
          p_episode_id: string
          p_patient_id: string
          p_retrospective_reason?: string
          p_template_code: string
          p_visibility: string
        }
        Returns: Json
      }
      create_clinical_record_draft: {
        Args: {
          p_encounter_at: string
          p_patient_id: string
          p_record_type: string
          p_visibility: string
        }
        Returns: Json
      }
      create_daily_log_reminders: { Args: never; Returns: undefined }
      create_diet_template:
        | {
            Args: {
              p_description: string
              p_meals: Json
              p_name: string
              p_tags: Json
              p_user_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_description: string
              p_meals: Json
              p_name: string
              p_tags: string[]
              p_user_id: string
            }
            Returns: string
          }
      delete_patient: { Args: { patient_id: string }; Returns: undefined }
      delete_read_notifications: { Args: never; Returns: undefined }
      end_care_episode: {
        Args: { p_end_reason?: string; p_patient_id: string }
        Returns: Json
      }
      end_student_supervision: {
        Args: { p_reason: string; p_supervision_id: string }
        Returns: Json
      }
      expire_clinical_attachment_uploads: {
        Args: { p_limit?: number }
        Returns: number
      }
      extract_and_inject_clinical_flags: {
        Args: { p_record_id: string }
        Returns: Json
      }
      fail_clinical_attachment_upload: {
        Args: { p_attachment_id: string; p_reason: string }
        Returns: Json
      }
      finalize_clinical_record: {
        Args: {
          p_content: Json
          p_expected_revision?: number
          p_record_id: string
          p_retrospective_reason?: string
        }
        Returns: Json
      }
      generate_anamnesis_link: {
        Args: {
          p_expires_days?: number
          p_nutritionist_id: string
          p_record_id: string
        }
        Returns: Json
      }
      generate_random_invite_code: {
        Args: { length?: number }
        Returns: string
      }
      generate_unique_invite_code: {
        Args: { col_name: string }
        Returns: string
      }
      get_admin_dashboard_stats: { Args: never; Returns: Json }
      get_anamnesis_by_token: { Args: { p_token: string }; Returns: Json }
      get_anthropometry_longitudinal_score: {
        Args: { p_patient_id: string }
        Returns: Json
      }
      get_care_patient_profile: {
        Args: { p_patient_id: string }
        Returns: Json
      }
      get_chat_recipient_profile: {
        Args: { recipient_id: string }
        Returns: {
          avatar_url: string
          id: string
          is_active: boolean
          last_seen_at: string
          name: string
          nutritionist_id: string
          user_type: string
        }[]
      }
      get_clinical_record_amendment_impact: {
        Args: { p_record_id: string }
        Returns: Json
      }
      get_comprehensive_activity_feed_optimized: {
        Args: { p_limit?: number; p_nutritionist_id: string }
        Returns: {
          activity_data: Json
          activity_date: string
          activity_id: string
          activity_type: string
          patient_id: string
          patient_name: string
        }[]
      }
      get_daily_adherence: {
        Args: { p_nutritionist_id: string }
        Returns: number
      }
      get_empty_patient_removal_status: {
        Args: { p_patient_id: string }
        Returns: Json
      }
      get_financial_summary: {
        Args: { end_date: string; start_date: string }
        Returns: Json
      }
      get_food_stats: { Args: { p_nutritionist_id: string }; Returns: Json }
      get_formatted_address: { Args: { address_jsonb: Json }; Returns: string }
      get_grams_from_measure: {
        Args: { p_food_id: number; p_measure_code: string; p_quantity?: number }
        Returns: number
      }
      get_invite_details: {
        Args: { p_invite_code: string }
        Returns: {
          nutritionist_gender: string
          nutritionist_name: string
          patient_name: string
        }[]
      }
      get_meal_plan_with_foods_optimized: {
        Args: { p_meal_plan_id: string }
        Returns: Json
      }
      get_my_care_relationship: { Args: never; Returns: Json }
      get_my_clinical_document_context: { Args: never; Returns: Json }
      get_my_professional_verification: { Args: never; Returns: Json }
      get_my_student_supervisions: {
        Args: never
        Returns: {
          counterpart_email: string
          counterpart_name: string
          ended_at: string
          id: string
          perspective: string
          requested_at: string
          responded_at: string
          started_at: string
          status: string
        }[]
      }
      get_nutritionist_conversations: {
        Args: { p_nutritionist_id: string }
        Returns: {
          is_active: boolean
          last_message_at: string
          last_message_content: string
          last_seen_at: string
          recipient_avatar: string
          recipient_id: string
          recipient_name: string
          unread_count: number
        }[]
      }
      get_nutritionist_detail: {
        Args: { p_nutritionist_id: string }
        Returns: Json
      }
      get_nutritionists_list: {
        Args: never
        Returns: {
          created_at: string
          email: string
          id: string
          is_active: boolean
          last_activity: string
          name: string
          patients_count: number
        }[]
      }
      get_operational_health_summary: {
        Args: { p_nutritionist_id?: string; p_window_hours?: number }
        Returns: Json
      }
      get_own_profile_attrs: {
        Args: never
        Returns: {
          is_admin: boolean
          user_type: string
        }[]
      }
      get_patient_record_foundation: {
        Args: { p_patient_id: string }
        Returns: Json
      }
      get_patients_for_new_chat: {
        Args: { p_nutritionist_id: string }
        Returns: {
          avatar_url: string
          id: string
          is_active: boolean
          last_seen_at: string
          name: string
        }[]
      }
      get_patients_low_adherence_optimized: {
        Args: { p_days_threshold?: number; p_nutritionist_id: string }
        Returns: {
          days_since_last_meal: number
          last_meal_date: string
          patient_id: string
          patient_name: string
        }[]
      }
      get_patients_pending_data_optimized: {
        Args: { p_nutritionist_id: string }
        Returns: {
          has_anamnese: boolean
          has_anthropometry: boolean
          has_meal_plan: boolean
          has_prescription: boolean
          patient_id: string
          patient_name: string
          pending_items: string[]
        }[]
      }
      get_recent_patient_activity: {
        Args: { limit_param: number; nutritionist_id_param: string }
        Returns: {
          created_at: string
          meal_id: number
          meal_type: string
          patient_name: string
          total_calories: number
        }[]
      }
      get_system_live_logs: {
        Args: { limit_count?: number }
        Returns: {
          event_timestamp: string
          id: string
          message: string
          type: string
          user_name: string
        }[]
      }
      get_tcc_study_metrics: { Args: never; Returns: Json }
      get_unread_senders: {
        Args: { p_user_id: string }
        Returns: {
          from_id: string
        }[]
      }
      get_user_id: { Args: never; Returns: string }
      increment_checkin_streak: {
        Args: { p_nutritionist_id: string; p_patient_id: string }
        Returns: undefined
      }
      interact_notification: {
        Args: { p_delete_if_message?: boolean; p_notification_id: string }
        Returns: undefined
      }
      invalidate_clinical_attachment: {
        Args: { p_attachment_id: string; p_reason: string }
        Returns: Json
      }
      invalidate_clinical_record: {
        Args: {
          p_impact_confirmation: Json
          p_reason: string
          p_record_id: string
        }
        Returns: Json
      }
      invalidate_progress_photo: {
        Args: { p_photo_id: string; p_reason: string }
        Returns: Json
      }
      is_admin: { Args: never; Returns: boolean }
      is_nutritionist: { Args: never; Returns: boolean }
      is_patient: { Args: never; Returns: boolean }
      list_clinical_attachments_by_episode: {
        Args: {
          p_cursor: string
          p_episode_id: string
          p_patient_id: string
          p_status: string
        }
        Returns: Json
      }
      list_clinical_record_version_chain: {
        Args: { p_record_id: string }
        Returns: Json[]
      }
      list_clinical_records_by_episode: {
        Args: {
          p_episode_id: string
          p_patient_id: string
          p_status_filter?: string
        }
        Returns: Json[]
      }
      list_evolution_templates: {
        Args: never
        Returns: {
          category: string
          code: string
          created_at: string
          description: string | null
          is_active: boolean
          name: string
          owner_id: string | null
          sections: Json
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "clinical_evolution_templates"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_my_clinical_documents: {
        Args: { p_care_episode_id: string }
        Returns: Json
      }
      list_nutritionist_care_patients: { Args: never; Returns: Json[] }
      list_patient_clinical_attachments: {
        Args: { p_care_episode_id: string }
        Returns: Json
      }
      list_patient_legal_guardians: {
        Args: { p_episode_id: string; p_patient_id: string }
        Returns: {
          author_id: string
          care_episode_id: string
          consent: Json
          contact: Json
          created_at: string
          id: string
          is_primary: boolean
          name: string
          patient_id: string
          relationship: string
          status: string
          updated_at: string
          valid_from: string
          valid_until: string
        }[]
      }
      list_patient_timeline: {
        Args: {
          p_cursor_at: string
          p_cursor_event_id: string
          p_episode_id: string
          p_limit: number
          p_patient_id: string
          p_scope: string
        }
        Returns: {
          category: string
          event_id: string
          is_legacy: boolean
          occurred_at: string
          source_id: string
          source_type: string
          status: string
          subtype: string
          summary: string
          title: string
        }[]
      }
      list_professional_verifications: {
        Args: { p_role?: string; p_status?: string }
        Returns: Json[]
      }
      log_activity_event: {
        Args: {
          p_event_name: string
          p_event_version?: number
          p_nutritionist_id?: string
          p_patient_id?: string
          p_payload?: Json
          p_source_module?: string
        }
        Returns: string
      }
      log_bug_report: {
        Args: {
          p_column_number?: number
          p_component_stack?: string
          p_console_log?: Json
          p_error_message?: string
          p_error_type?: string
          p_line_number?: number
          p_metadata?: Json
          p_route?: string
          p_source_file?: string
          p_stack_trace?: string
          p_user_agent?: string
          p_user_email?: string
          p_user_id?: string
          p_user_name?: string
          p_user_type?: string
        }
        Returns: string
      }
      log_meal_action: {
        Args: {
          p_action: string
          p_details?: Json
          p_meal_date?: string
          p_meal_id: number
          p_meal_time?: string
          p_meal_type?: string
          p_patient_id: string
        }
        Returns: number
      }
      log_meal_action_secure: {
        Args: { p_action: string; p_details: Json; p_meal_id: string }
        Returns: undefined
      }
      log_operational_event: {
        Args: {
          p_error_message?: string
          p_event_type?: string
          p_latency_ms?: number
          p_metadata?: Json
          p_module: string
          p_nutritionist_id?: string
          p_operation: string
          p_patient_id?: string
        }
        Returns: number
      }
      mark_chat_notifications_as_read: {
        Args: { p_sender_id: string; p_user_id: string }
        Returns: undefined
      }
      mark_messages_as_read: {
        Args: { p_sender_id: string; p_user_id: string }
        Returns: undefined
      }
      notify_nutritionist_anamnesis_completed: {
        Args: { p_record_id: string }
        Returns: undefined
      }
      process_patient_reminders: {
        Args: { p_patient_id?: string }
        Returns: Json
      }
      promote_draft_to_active: {
        Args: { p_draft_id: number; p_patient_id: string }
        Returns: undefined
      }
      redeem_invite_code: { Args: { input_code: string }; Returns: Json }
      reject_patient_link: { Args: { p_patient_id: string }; Returns: Json }
      remove_empty_patient: { Args: { p_patient_id: string }; Returns: Json }
      request_student_supervision: {
        Args: { p_supervisor_id: string }
        Returns: Json
      }
      request_student_supervision_by_email: {
        Args: { p_supervisor_email: string }
        Returns: Json
      }
      request_verification_information: {
        Args: { p_reason: string; p_verification_id: string }
        Returns: Json
      }
      respond_student_supervision: {
        Args: { p_decision: string; p_reason: string; p_supervision_id: string }
        Returns: Json
      }
      review_patient_clinical_attachment: {
        Args: {
          p_attachment_id: string
          p_category_code?: string
          p_clinical_date?: string
          p_clinical_record_id?: string
          p_decision: string
          p_description?: string
          p_reason?: string
        }
        Returns: Json
      }
      review_professional_verification: {
        Args: {
          p_decision: string
          p_reason: string
          p_source_url: string
          p_valid_until: string
          p_verification_id: string
        }
        Returns: Json
      }
      revoke_patient_legal_guardian: {
        Args: { p_guardian_id: string; p_reason: string }
        Returns: Json
      }
      search_foods: {
        Args: { p_limit?: number; p_search_term: string; p_source?: string }
        Returns: {
          calories: number
          carbs: number
          description: string
          fat: number
          group: string
          id: number
          name: string
          protein: number
          source: string
        }[]
      }
      set_active_meal_plan: { Args: { p_plan_id: number }; Returns: undefined }
      sign_clinical_record: { Args: { p_record_id: string }; Returns: Json }
      slugify_name: { Args: { p_name: string }; Returns: string }
      soft_delete_meal: { Args: { p_meal_id: number }; Returns: boolean }
      start_care_episode: {
        Args: { p_patient_id: string; p_start_reason?: string }
        Returns: Json
      }
      start_clinical_record_correction: {
        Args: {
          p_impact_confirmation: Json
          p_reason: string
          p_record_id: string
        }
        Returns: Json
      }
      submit_anamnesis_by_token: {
        Args: {
          p_clinical_flags?: Json
          p_content: Json
          p_ip?: string
          p_lgpd_consented?: boolean
          p_status: string
          p_token: string
        }
        Returns: Json
      }
      submit_professional_verification: {
        Args: { p_payload: Json }
        Returns: Json
      }
      suspend_professional_verification: {
        Args: { p_reason: string; p_verification_id: string }
        Returns: Json
      }
      transition_appointment_status:
        | {
            Args: {
              p_appointment_id: number
              p_next_status: string
              p_reason?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_appointment_id: string
              p_next_status: string
              p_reason?: string
            }
            Returns: Json
          }
      update_clinical_record_draft: {
        Args: {
          p_content: Json
          p_expected_revision?: number
          p_record_id: string
          p_visibility?: string
        }
        Returns: Json
      }
      update_diet_template:
        | {
            Args: {
              p_description: string
              p_meals: Json
              p_name: string
              p_tags: Json
              p_template_id: string
              p_user_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_description: string
              p_meals: Json
              p_name: string
              p_tags: string[]
              p_template_id: string
              p_user_id: string
            }
            Returns: undefined
          }
      update_patient_progressive_profile: {
        Args: { p_changes: Json; p_patient_id: string; p_source: string }
        Returns: Json
      }
      upsert_full_meal_plan: {
        Args: { p_meals: Json; p_plan_data: Json; p_plan_id: number }
        Returns: Json
      }
      upsert_patient_legal_guardian: {
        Args: { p_episode_id: string; p_patient_id: string; p_payload: Json }
        Returns: Json
      }
      version_private_evolution_template: {
        Args: { p_sections: Json; p_template_code: string }
        Returns: Json
      }
    }
    Enums: {
      food_source:
        | "TACO"
        | "TBCA"
        | "USDA"
        | "CUSTOM"
        | "OFF"
        | "TUCUNDUVA"
        | "Nello"
      meal_type_enum:
        | "breakfast"
        | "morning_snack"
        | "lunch"
        | "afternoon_snack"
        | "dinner"
        | "supper"
        | "pre_workout"
        | "post_workout"
        | "other"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          metadata: Json | null
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] }
        Returns: boolean
      }
      allow_only_operation: {
        Args: { expected_operation: string }
        Returns: boolean
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  private: {
    Enums: {},
  },
  public: {
    Enums: {
      food_source: [
        "TACO",
        "TBCA",
        "USDA",
        "CUSTOM",
        "OFF",
        "TUCUNDUVA",
        "Nello",
      ],
      meal_type_enum: [
        "breakfast",
        "morning_snack",
        "lunch",
        "afternoon_snack",
        "dinner",
        "supper",
        "pre_workout",
        "post_workout",
        "other",
      ],
    },
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const