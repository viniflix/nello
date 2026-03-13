/**
 * PostHog Analytics — HipoZero
 * Tracking de comportamento para TCC em Nutrição
 * Usa posthog-js direto para funções utilitárias (identify, reset, capture)
 */
import posthog from 'posthog-js';

// Nomes corretos para Vite + PostHog docs oficiais
export const POSTHOG_KEY = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
export const POSTHOG_HOST = import.meta.env.VITE_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

/**
 * Identifica o usuário no PostHog (chamado após login)
 * Usa apenas propriedades não-sensíveis (sem nome, email, CPF)
 */
export function identifyUser(user) {
  if (!POSTHOG_KEY || !user?.id) return;

  posthog.identify(user.id, {
    user_type: user.profile?.user_type,
    is_admin: user.profile?.is_admin ?? false,
    has_crn: !!user.profile?.crn,
    patient_category: user.profile?.patient_category,
    signup_date: user.profile?.created_at,
  });
}

/**
 * Reseta identidade no logout
 */
export function resetUser() {
  if (!POSTHOG_KEY) return;
  posthog.reset();
}

/**
 * Captura evento customizado
 */
export function track(event, properties = {}) {
  if (!POSTHOG_KEY) return;
  posthog.capture(event, { ...properties, platform: 'hipozero' });
}

// ── Catálogo de eventos para o TCC ─────────────────────────────────────────
export const Events = {
  MEAL_LOGGED:                'meal_logged',
  MEAL_EDITED:                'meal_edited',
  MEAL_DELETED:               'meal_deleted',
  ANAMNESIS_STARTED:          'anamnesis_started',
  ANAMNESIS_COMPLETED:        'anamnesis_completed',
  GOAL_CREATED:               'goal_created',
  GOAL_UPDATED:               'goal_updated',
  GOAL_COMPLETED:             'goal_completed',
  APPOINTMENT_SCHEDULED:      'appointment_scheduled',
  APPOINTMENT_COMPLETED:      'appointment_completed',
  APPOINTMENT_CANCELLED:      'appointment_cancelled',
  MEAL_PLAN_CREATED:          'meal_plan_created',
  MEAL_PLAN_VIEWED:           'meal_plan_viewed',
  GROWTH_RECORD_ADDED:        'growth_record_added',
  GROWTH_RECORD_VIEWED:       'growth_record_viewed',
  CHAT_MESSAGE_SENT:          'chat_message_sent',
  ACHIEVEMENT_EARNED:         'achievement_earned',
  ENERGY_CALC_PERFORMED:      'energy_calc_performed',
  STUDY_AREA_VIEWED:          'study_area_viewed',
};

export default posthog;
