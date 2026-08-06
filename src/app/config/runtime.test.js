import { describe, expect, it } from 'vitest';
import { queryClient, queryClientOptions } from './queryClient';
import { createPosthogOptions } from './posthog';
import { sanitizePosthogEvent } from '@/infrastructure/analytics/posthog';

const securePosthogDefaults = {
  defaults: '2026-01-30',
  autocapture: false,
  capture_pageview: 'history_change',
  capture_pageleave: true,
  capture_exceptions: true,
  capture_dead_clicks: true,
  disable_session_recording: true,
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

describe('application runtime configuration', () => {
  it('preserves the query defaults used by the application', () => {
    expect(queryClientOptions).toEqual({
      defaultOptions: {
        queries: {
          staleTime: 1000 * 60 * 5,
          retry: 1,
          refetchOnWindowFocus: false,
        },
      },
    });
    expect(queryClient.getDefaultOptions()).toEqual(queryClientOptions.defaultOptions);
  });

  it('uses the configured PostHog host', () => {
    expect(createPosthogOptions({ VITE_PUBLIC_POSTHOG_HOST: 'https://analytics.example.com' })).toEqual({
      api_host: 'https://analytics.example.com',
      ...securePosthogDefaults,
    });
  });

  it('falls back to the current PostHog host', () => {
    expect(createPosthogOptions({})).toEqual({
      api_host: 'https://us.i.posthog.com',
      ...securePosthogDefaults,
    });
  });
});
