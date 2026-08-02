import { sanitizePosthogEvent } from '@/infrastructure/analytics/posthog';

export function createPosthogOptions(env) {
  return {
    api_host: env.VITE_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    defaults: '2026-01-30',
    autocapture: false,
    capture_pageview: 'history_change',
    capture_pageleave: true,
    capture_exceptions: true,
    capture_dead_clicks: true,
    disable_session_recording: false,
    enable_recording_console_log: false,
    mask_all_text: true,
    mask_all_element_attributes: true,
    mask_personal_data_properties: true,
    custom_personal_data_properties: ['email', 'phone', 'cpf', 'patient', 'patient_id'],
    person_profiles: 'identified_only',
    session_recording: {
      blockSelector: 'img, video, audio, canvas, [data-posthog-block]',
      maskTextSelector: '*',
      maskAllInputs: true,
      collectFonts: false,
      recordCrossOriginIframes: false,
      recordHeaders: false,
      recordBody: false,
    },
    before_send: sanitizePosthogEvent,
  };
}

export const posthogOptions = createPosthogOptions(import.meta.env);
