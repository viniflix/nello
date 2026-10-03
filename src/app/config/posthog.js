import { sanitizePosthogEvent } from '@/infrastructure/analytics/posthog';
import { hasAnalyticsConsent } from '@/features/privacy/consent';
import { reportAnalyticsFailure } from '@/infrastructure/analytics/pipelineHealth';

export const captureWithConsent = event => hasAnalyticsConsent() ? sanitizePosthogEvent(event) : null;

export function createPosthogOptions(env) {
  return {
    api_host: env.VITE_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    defaults: '2026-01-30',
    autocapture: false,
    capture_pageview: 'history_change',
    capture_pageleave: true,
    // Handled failures use the minimized, correlated operation_failed contract.
    capture_exceptions: false,
    capture_dead_clicks: false,
    // Health data must not be replayed until a consent/legal-basis gate exists.
    disable_session_recording: true,
    enable_recording_console_log: false,
    mask_all_text: true,
    mask_all_element_attributes: true,
    mask_personal_data_properties: true,
    custom_personal_data_properties: ['email', 'phone', 'cpf', 'patient', 'patient_id'],
    person_profiles: 'identified_only',
    opt_out_capturing_by_default: true,
    opt_out_persistence_by_default: true,
    persistence: 'memory',
    session_recording: {
      blockSelector: 'img, video, audio, canvas, [data-posthog-block]',
      maskTextSelector: '*',
      maskAllInputs: true,
      collectFonts: false,
      recordCrossOriginIframes: false,
      recordHeaders: false,
      recordBody: false,
    },
    before_send: captureWithConsent,
    on_request_error: () => { if(hasAnalyticsConsent())reportAnalyticsFailure('sdk_failure'); },
  };
}

export const posthogOptions = createPosthogOptions(import.meta.env);
