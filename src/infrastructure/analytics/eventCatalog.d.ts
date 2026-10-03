export type Outcome = 'started' | 'succeeded' | 'failed' | 'cancelled';
export type Audience = 'public' | 'authenticated' | 'external' | 'internal' | 'qa';
export interface ProductProperties {
 operation?: string; module?: string; source?: string; flow?: string;
 outcome?: Outcome; failure_kind?: 'expected' | 'technical';
 duration_ms?: number; result_count?: number; http_status?: number | null;
 correlation_id?: string; session_id?: string | null; audience?: Audience;
 event_schema_version?: 1; user_type?: 'patient' | 'nutritionist' | 'admin' | 'anonymous' | 'unknown';
 is_admin?: boolean; cause_reason?: string; error_code?: string; failure_reason?: string;
 route?: string; page?: number; pages?: number; sample_rate?: number;
 sample_type?: 'first' | 'slow' | 'sampled' | 'baseline' | 'random' | 'session_operation';
 platform?: 'nello'; pixel_ratio?: number;
}
export const EVENT_SCHEMA_VERSION: 1;
export type ProductEvent = "operation_failed" | "data_load_timing" | "ui_action_outcome" | "auth_login_failed" | "auth_login_succeeded" | "auth_logout" | "auth_signup_started" | "auth_signup_submitted" | "auth_signup_failed" | "auth_password_recovery_requested" | "auth_password_updated" | "auth_invite_redeemed" | "meal_logged" | "meal_edited" | "meal_deleted" | "anamnesis_started" | "anamnesis_completed" | "goal_created" | "goal_updated" | "goal_completed" | "appointment_scheduled" | "appointment_completed" | "appointment_cancelled" | "meal_plan_created" | "meal_plan_published" | "meal_plan_viewed" | "growth_record_added" | "growth_record_viewed" | "chat_message_sent" | "achievement_earned" | "energy_calc_performed" | "study_area_viewed" | "patient_created" | "anthropometry_saved" | "document_generated" | "analytics_pipeline_probe";
export const PRODUCT_EVENTS: readonly ProductEvent[];
export const CONFIRMED_OUTCOMES: Readonly<Record<string,ProductEvent>>;
export function validateProductEvent(event:string,properties?:ProductProperties):
 {valid:true;event:string;properties:ProductProperties} | {valid:false;reason:string};
