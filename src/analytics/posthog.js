/**
 * PostHog Analytics — HipoZero
 * Tracking de comportamento de uso para pesquisa acadêmica (TCC Nutrição)
 */
import posthog from 'posthog-js';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

export function initPostHog() {
  if (!POSTHOG_KEY) {
    console.warn('[PostHog] VITE_POSTHOG_KEY não configurado — analytics desativado.');
    return;
  }

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: 'identified_only', // privacy-first
    capture_pageview: true, // auto-track page views
    capture_pageleave: true,
    autocapture: false, // manual tracking for precision
    disable_session_recording: false,
    loaded: (ph) => {
      if (import.meta.env.DEV) {
        console.info('[PostHog] Inicializado em modo DEV');
      }
    },
  });
}

/**
 * Identifica o usuário no PostHog com propriedades seguras (sem PII sensível)
 * @param {object} user - Objeto do usuário autenticado
 */
export function identifyUser(user) {
  if (!POSTHOG_KEY || !user?.id) return;

  posthog.identify(user.id, {
    user_type: user.profile?.user_type,
    is_admin: user.profile?.is_admin ?? false,
    has_crn: !!user.profile?.crn,          // nutricionista ou não (sem dado real)
    patient_category: user.profile?.patient_category,
    signup_date: user.profile?.created_at,
  });
}

/**
 * Reseta a identidade (logout)
 */
export function resetUser() {
  if (!POSTHOG_KEY) return;
  posthog.reset();
}

/**
 * Captura um evento customizado com propriedades opcionais
 */
export function track(event, properties = {}) {
  if (!POSTHOG_KEY) return;
  posthog.capture(event, { ...properties, platform: 'hipozero' });
}

// ── Eventos de alto valor para o TCC ────────────────────────────────────────

export const Events = {
  // Diário alimentar
  MEAL_LOGGED:                'meal_logged',
  MEAL_EDITED:                'meal_edited',
  MEAL_DELETED:               'meal_deleted',

  // Anamnese
  ANAMNESIS_STARTED:          'anamnesis_started',
  ANAMNESIS_COMPLETED:        'anamnesis_completed',

  // Metas
  GOAL_CREATED:               'goal_created',
  GOAL_UPDATED:               'goal_updated',
  GOAL_COMPLETED:             'goal_completed',

  // Consultas
  APPOINTMENT_SCHEDULED:      'appointment_scheduled',
  APPOINTMENT_COMPLETED:      'appointment_completed',
  APPOINTMENT_CANCELLED:      'appointment_cancelled',

  // Plano alimentar
  MEAL_PLAN_CREATED:          'meal_plan_created',
  MEAL_PLAN_VIEWED:           'meal_plan_viewed',

  // Antropometria
  GROWTH_RECORD_ADDED:        'growth_record_added',
  GROWTH_RECORD_VIEWED:       'growth_record_viewed',

  // Chat
  CHAT_MESSAGE_SENT:          'chat_message_sent',

  // Gamificação
  ACHIEVEMENT_EARNED:         'achievement_earned',

  // Cálculo energético
  ENERGY_CALC_PERFORMED:      'energy_calc_performed',

  // Admin / TCC
  STUDY_AREA_VIEWED:          'study_area_viewed',
};

export default posthog;
