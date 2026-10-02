import { logDiagnostic } from '@/infrastructure/observability/safeLogger';
import posthog from './lazyPosthog';
import { createTimingSampler } from './timingSample';
import { technicalIdentity } from '@/infrastructure/observability/technicalIdentity';
import { bindConsentOwner, clearAnalyticsChoice, hasAnalyticsConsent } from '@/features/privacy/consent';
const sampleTiming = createTimingSampler();

export const POSTHOG_KEY = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
export const POSTHOG_HOST = import.meta.env.VITE_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

const SENSITIVE_KEYS = new Set([
  'address',
  'content',
  'cpf',
  'diagnosis',
  'email',
  'exam',
  'message',
  'name',
  'notes',
  'patient_id',
  'patient_name',
  'phone',
  'username',
  'authorization',
  'password',
  'token',
  'access_token',
  'refresh_token',
  'cookie',
  'cookies',
  'headers',
  'body',
]);

function normalizeKey(key) {
  return key.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
}

export function scrubAnalyticsString(value) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]')
    .replace(/(\/patients\/)[^/?#\s]+/gi, '$1:patient')
    .replace(/(\/f\/)[^/?#\s]+/gi, '$1:token')
    .replace(/(\/verificar-documento\/)[^/?#\s]+/gi, '$1:code')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[UUID]')
    .replace(/(https?:\/\/[^\s?#]+)[?#][^\s]*/gi, '$1');
}

export function sanitizeAnalyticsProperties(value) {
  if (Array.isArray(value)) return value.map(sanitizeAnalyticsProperties);
  if (typeof value === 'string') return scrubAnalyticsString(value);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEYS.has(normalizeKey(key)))
      .map(([key, nestedValue]) => [key, sanitizeAnalyticsProperties(nestedValue)]),
  );
}

export function sanitizePosthogEvent(captureResult) {
  if (!captureResult) return null;
  const allowed = new Set(['distinct_id', '$anon_distinct_id', '$device_id', '$session_id', '$window_id', '$insert_id',
    '$current_url', '$pathname', '$host', '$browser', '$browser_version', '$os', '$os_version',
    '$device_type', '$screen_height', '$screen_width', '$viewport_height', '$viewport_width',
    '$lib', '$lib_version', '$is_identified', '$process_person_profile', '$set', '$set_once',
    'user_type', 'is_admin', 'correlation_id', 'session_id', 'operation', 'module', 'source',
    'error_code', 'failure_reason', 'http_status', 'route', 'duration_ms', 'result_count',
    'pages', 'page', 'flow', 'outcome', 'platform', 'app_release', 'environment', 'pixel_ratio', 'sample_rate', 'sample_type', 'audience']);
  const original = captureResult.properties || {};
  const properties = sanitizeAnalyticsProperties(Object.fromEntries(Object.entries(original).filter(([key]) => allowed.has(key))));
  // The SDK needs its configured public project key to route the event.
  // Never preserve arbitrary tokens or any authentication credentials.
  if (POSTHOG_KEY && original.token === POSTHOG_KEY) properties.token = POSTHOG_KEY;
  for (const key of ['distinct_id', '$anon_distinct_id', '$device_id', '$session_id', '$window_id', '$insert_id', 'correlation_id', 'session_id']) {
    const id = technicalIdentity(original[key]);
    if (id) properties[key] = id;
  }
  for (const key of ['$set', '$set_once']) {
    if (original[key]) properties[key] = sanitizeAnalyticsProperties(Object.fromEntries(Object.entries(original[key]).filter(([name]) => ['user_type', 'is_admin'].includes(name))));
  }
  const result = {
    ...captureResult,
    properties: {
      ...properties,
      app_release: import.meta.env.VITE_APP_RELEASE || 'development',
      environment: import.meta.env.MODE || 'development',
    },
  };
  // The SDK also sends person updates at the envelope root, not just properties.
  for (const key of ['$set', '$set_once']) {
    if (captureResult[key]) result[key] = sanitizeAnalyticsProperties(Object.fromEntries(Object.entries(captureResult[key]).filter(([name]) => ['user_type', 'is_admin'].includes(name))));
  }
  return result;
}

export function getObservabilitySessionId() {
  if (!hasAnalyticsConsent()) return null;
  try { return technicalIdentity(posthog.get_session_id?.()); } catch { return null; }
}

export function identifyUser(user) {
  try {
    bindConsentOwner(user?.id);
    if (!POSTHOG_KEY || !user?.id || !hasAnalyticsConsent(user.id)) return;
    if (!posthog?.__loaded && !posthog?.initialized) return;

    posthog.identify(user.id, {
      user_type: user.profile?.user_type,
      is_admin: user.profile?.is_admin ?? false,
    });
  } catch (err) {
    if (import.meta.env.DEV) logDiagnostic('warn', 'infrastructure/analytics/posthog.js:110', '[PostHog] identifyUser failed:', err.message);
  }
}

export function resetUser() {
  clearAnalyticsChoice();
  bindConsentOwner(null);
  try {
    if (!POSTHOG_KEY) return;
    posthog.reset();
  } catch (err) {
    if (import.meta.env.DEV) logDiagnostic('warn', 'infrastructure/analytics/posthog.js:119', '[PostHog] resetUser failed:', err.message);
  }
}

export function track(event, properties = {}) {
  try {
    if (!POSTHOG_KEY || !hasAnalyticsConsent()) return;
    const sessionId = getObservabilitySessionId();
    if (event === 'data_load_timing') {
      const sampling = sampleTiming({ session: sessionId, operation: properties.operation, duration: properties.duration_ms });
      if (!sampling) return;
      properties = { ...properties, ...sampling, audience: typeof window !== 'undefined' && /^\/(?:nutritionist|patient|admin)(?:\/|$)/.test(window.location.pathname) ? 'authenticated' : 'public' };
    }
    posthog.capture(event, sanitizePosthogEvent({ event, properties: {
      ...properties,
      session_id: sessionId,
      pixel_ratio: typeof window !== 'undefined' ? window.devicePixelRatio : undefined,
      platform: 'nello',
      app_release: import.meta.env.VITE_APP_RELEASE || 'development',
      environment: import.meta.env.MODE || 'development',
    } }).properties);
  } catch (err) {
    if (import.meta.env.DEV) logDiagnostic('warn', 'infrastructure/analytics/posthog.js:135', '[PostHog] track failed:', err.message);
  }
}

// Catalogo estavel de eventos de produto.
export const Events = {
  OPERATION_FAILED: 'operation_failed',
  DATA_LOAD_TIMING: 'data_load_timing',
  UI_ACTION_OUTCOME: 'ui_action_outcome',
  AUTH_LOGIN_FAILED: 'auth_login_failed',
  AUTH_SIGNUP_STARTED: 'auth_signup_started',
  AUTH_SIGNUP_SUBMITTED: 'auth_signup_submitted',
  AUTH_SIGNUP_FAILED: 'auth_signup_failed',
  AUTH_PASSWORD_RECOVERY_REQUESTED: 'auth_password_recovery_requested',
  AUTH_PASSWORD_UPDATED: 'auth_password_updated',
  AUTH_INVITE_REDEEMED: 'auth_invite_redeemed',
  MEAL_LOGGED: 'meal_logged',
  MEAL_EDITED: 'meal_edited',
  MEAL_DELETED: 'meal_deleted',
  ANAMNESIS_STARTED: 'anamnesis_started',
  ANAMNESIS_COMPLETED: 'anamnesis_completed',
  GOAL_CREATED: 'goal_created',
  GOAL_UPDATED: 'goal_updated',
  GOAL_COMPLETED: 'goal_completed',
  APPOINTMENT_SCHEDULED: 'appointment_scheduled',
  APPOINTMENT_COMPLETED: 'appointment_completed',
  APPOINTMENT_CANCELLED: 'appointment_cancelled',
  MEAL_PLAN_CREATED: 'meal_plan_created',
  MEAL_PLAN_VIEWED: 'meal_plan_viewed',
  GROWTH_RECORD_ADDED: 'growth_record_added',
  GROWTH_RECORD_VIEWED: 'growth_record_viewed',
  CHAT_MESSAGE_SENT: 'chat_message_sent',
  ACHIEVEMENT_EARNED: 'achievement_earned',
  ENERGY_CALC_PERFORMED: 'energy_calc_performed',
  STUDY_AREA_VIEWED: 'study_area_viewed',
};

export default posthog;
