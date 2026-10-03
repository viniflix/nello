/** @typedef {{event: string, properties: Record<string, unknown>}} ValidatedEvent */
export const EVENT_SCHEMA_VERSION = 1;
const code = v => typeof v === 'string' && /^[a-z0-9_.:-]{1,120}$/i.test(v);
const count = v => Number.isFinite(v) && v >= 0 && v <= 1e9;
const choice = values => v => values.includes(v);
const common = { operation: code, module: code, source: code, flow: code,
  event_schema_version: v => v === EVENT_SCHEMA_VERSION,
  outcome: choice(['started','succeeded','failed','cancelled']),
  failure_kind: choice(['expected','technical']),
  cause_reason: code,
  user_type: choice(['patient','nutritionist','admin','anonymous','unknown']),
  is_admin: v => typeof v === 'boolean', duration_ms: count, result_count: count,
  page: count, pages: count, error_code: code, failure_reason: code,
  http_status: v => v === null || (Number.isInteger(v) && v >= 100 && v <= 599),
  route: v => typeof v === 'string' && v.startsWith('/') && v.length <= 300,
  correlation_id: code, session_id: v => v === null || code(v), sample_rate: v => count(v) && v <= 1,
  sample_type: choice(['first','slow','sampled','baseline','random','session_operation']),
  audience: choice(['public','authenticated','external','internal','qa']),
  platform: choice(['nello']), pixel_ratio: count,
};
export const PRODUCT_EVENTS = Object.freeze([
 'operation_failed','data_load_timing','ui_action_outcome','auth_login_failed',
 'auth_login_succeeded','auth_logout','auth_signup_started','auth_signup_submitted',
 'auth_signup_failed','auth_password_recovery_requested','auth_password_updated',
 'auth_invite_redeemed','meal_logged','meal_edited','meal_deleted','anamnesis_started',
 'anamnesis_completed','goal_created','goal_updated','goal_completed',
 'appointment_scheduled','appointment_completed','appointment_cancelled',
 'meal_plan_created','meal_plan_published','meal_plan_viewed','growth_record_added',
 'growth_record_viewed','chat_message_sent','achievement_earned','energy_calc_performed',
 'study_area_viewed','patient_created','anthropometry_saved','document_generated','analytics_pipeline_probe',
]);
const sdkEvents = new Set(['$pageview','$pageleave','$identify','$set','$create_alias']);
const allowed = new Set(PRODUCT_EVENTS);
/** Validate before SDK ingestion; unknown fields never reach an external provider. */
export function validateProductEvent(event, properties = {}) {
 if (!allowed.has(event) && !sdkEvents.has(event)) return {valid:false,reason:'unknown_event'};
 if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return {valid:false,reason:'invalid_properties'};
 if(event==='ui_action_outcome' && (!code(properties.operation) || !common.outcome(properties.outcome)))return {valid:false,reason:'invalid_property'};
 const safe = {};
 for (const [key,value] of Object.entries(properties)) {
  if (!(key in common)) continue;
  if (value === undefined) continue;
  if (!common[key](value)) return {valid:false,reason:'invalid_property'};
  safe[key]=value;
 }
 return {valid:true,event,properties:safe};
}
export const CONFIRMED_OUTCOMES = Object.freeze({anthropometry_save:'anthropometry_saved',energy_save:'energy_calc_performed',meal_plan_apply:'meal_plan_published'});
