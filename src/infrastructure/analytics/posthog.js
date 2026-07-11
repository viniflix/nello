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

export function sanitizeAnalyticsProperties(value) {
  if (Array.isArray(value)) return value.map(sanitizeAnalyticsProperties);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEYS.has(normalizeKey(key)))
      .map(([key, nestedValue]) => [key, sanitizeAnalyticsProperties(nestedValue)]),
  );
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
    });
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[PostHog] track failed:', err.message);
  }
}

// Catalogo estavel de eventos de produto.
export const Events = {
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
