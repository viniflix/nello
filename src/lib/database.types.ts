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
      anamnese_answers: {
        Row: {
          answer_value: string | null
          field_id: number
          id: number
          patient_id: string
          updated_at: string | null
        }
        Insert: {
          answer_value?: string | null
          field_id: number
          id?: never
          patient_id: string
          updated_at?: string | null
        }
        Update: {
          answer_value?: string | null
          field_id?: number
          id?: never
          patient_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anamnese_answers_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "anamnese_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamnese_answers_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "anamnese_answers_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      anamnese_field_options: {
        Row: {
          created_at: string | null
          field_id: number
          id: number
          option_order: number | null
          option_text: string
        }
        Insert: {
          created_at?: string | null
          field_id: number
          id?: number
          option_order?: number | null
          option_text: string
        }
        Update: {
          created_at?: string | null
          field_id?: number
          id?: number
          option_order?: number | null
          option_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "anamnese_field_options_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "anamnese_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      anamnese_fields: {
        Row: {
          category: string | null
          created_at: string | null
          field_label: string
          field_type: string
          id: number
          is_required: boolean | null
          nutritionist_id: string
          options: string[] | null
          order: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          field_label: string
          field_type: string
          id?: never
          is_required?: boolean | null
          nutritionist_id: string
          options?: string[] | null
          order?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          field_label?: string
          field_type?: string
          id?: never
          is_required?: boolean | null
          nutritionist_id?: string
          options?: string[] | null
          order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "anamnese_fields_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "patient_hub_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "anamnese_fields_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      anamnesis_records: {
        Row: {
          content: Json
          created_at: string | null
          date: string
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
          content: Json
          created_at?: string | null
          date?: string
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
          content?: Json
          created_at?: string | null
          date?: string
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
      anamnesis_template_fields: {
        Row: {
          created_at: string | null
          field_id: number
          field_order: number | null
          id: number
          template_id: string
        }
        Insert: {
          created_at?: string | null
          field_id: number
          field_order?: number | null
          id?: number
          template_id: string
        }
        Update: {
          created_at?: string | null
          field_id?: number
          field_order?: number | null
          id?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "anamnesis_template_fields_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "anamnese_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamnesis_template_fields_template_id_fkey"
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
      meal_audit_log: {
        Row: {
          action: string
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
          edited_at: string
          id: number
          meal_id: number
          new_data: Json
          original_data: Json
          patient_id: string
        }
        Insert: {
          edited_at?: string
          id?: number
          meal_id: number
          new_data: Json
          original_data: Json
          patient_id: string
        }
        Update: {
          edited_at?: string
          id?: number
          meal_id?: number
          new_data?: Json
          original_data?: Json
          patient_id?: string
        }
        Relationships: [
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
      patient_goals: {
        Row: {
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
        Relationships: []
      }
      progress_photos: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          patient_id: string
          photo_date: string
          photo_url: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          patient_id: string
          photo_date: string
          photo_url: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          patient_id?: string
          photo_date?: string
          photo_url?: string
          uploaded_by?: string | null
        }
        Relationships: [
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
      supplement_logs: {
        Row: {
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
          slug?: string | null
          specialties?: string[] | null
          user_type?: string
          weight?: number | null
        }
        Relationships: []
      }
      weekly_summaries: {
        Row: {
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
        Returns: string
      }
      delete_patient: { Args: { patient_id: string }; Returns: undefined }
      delete_read_notifications: { Args: never; Returns: undefined }
      generate_random_invite_code: {
        Args: { length?: number }
        Returns: string
      }
      generate_unique_invite_code: {
        Args: { col_name: string }
        Returns: string
      }
      get_admin_dashboard_stats: { Args: never; Returns: Json }
      get_anthropometry_longitudinal_score: {
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
      is_admin: { Args: never; Returns: boolean }
      is_nutritionist: { Args: never; Returns: boolean }
      is_patient: { Args: never; Returns: boolean }
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
      slugify_name: { Args: { p_name: string }; Returns: string }
      soft_delete_meal: { Args: { p_meal_id: number }; Returns: boolean }
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
} as const
