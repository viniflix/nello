import posthog from 'posthog-js';

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
]);

function normalizeKey(key) {
  return key.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
}

export function scrubAnalyticsString(value) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]')
    .replace(/(\/patients\/)[^/?#\s]+/gi, '$1:patient')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[UUID]')
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
  return {
    ...captureResult,
    properties: {
      ...sanitizeAnalyticsProperties(captureResult.properties || {}),
      app_release: import.meta.env.VITE_APP_RELEASE || 'development',
      environment: import.meta.env.MODE || 'development',
    },
  };
}

export function identifyUser(user) {
  try {
    if (!POSTHOG_KEY || !user?.id) return;
    if (!posthog?.__loaded && !posthog?.initialized) return;

    posthog.identify(user.id, {
      user_type: user.profile?.user_type,
      is_admin: user.profile?.is_admin ?? false,
    });
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[PostHog] identifyUser failed:', err.message);
  }
}

export function resetUser() {
  try {
    if (!POSTHOG_KEY) return;
    posthog.reset();
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[PostHog] resetUser failed:', err.message);
  }
}

export function track(event, properties = {}) {
  try {
    if (!POSTHOG_KEY) return;
    posthog.capture(event, {
      ...sanitizeAnalyticsProperties(properties),
      platform: 'nello',
      app_release: import.meta.env.VITE_APP_RELEASE || 'development',
      environment: import.meta.env.MODE || 'development',
    });
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[PostHog] track failed:', err.message);
  }
}

// Catalogo estavel de eventos de produto.
export const Events = {
  OPERATION_FAILED: 'operation_failed',
  AUTH_LOGIN_FAILED: 'auth_login_failed',
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
