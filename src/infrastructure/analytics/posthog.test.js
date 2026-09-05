import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sanitizeAnalyticsProperties, sanitizePosthogEvent } from './posthog';

describe('sanitizeAnalyticsProperties', () => {
  beforeEach(() => vi.stubEnv('VITE_APP_RELEASE', '0.0.0'));
  afterEach(() => vi.unstubAllEnvs());
  it('keeps operational metrics and removes nested personal or clinical data', () => {
    const source = {
      feature: 'agenda',
      duration_ms: 120,
      patient_name: 'Maria',
      email: 'patient@example.com',
      payload: {
        diagnosis: 'sensitive',
        message: 'clinical text',
        item_count: 3,
      },
    };

    expect(sanitizeAnalyticsProperties(source)).toEqual({
      feature: 'agenda',
      duration_ms: 120,
      payload: { item_count: 3 },
    });
    expect(source.payload.diagnosis).toBe('sensitive');
  });

  it('redacts patient routes, identifiers, email addresses and query strings', () => {
    expect(sanitizePosthogEvent({
      event: '$pageview',
      properties: {
        $current_url: 'https://www.nello.com.br/nutritionist/patients/9ba45c9b-d0d4-490d-96a0-6addd7826833/meal-plan?token=secret',
        route: '/nutritionist/patients/patient-slug/anthropometry',
        error: 'Contact patient@example.com for 9ba45c9b-d0d4-490d-96a0-6addd7826833',
      },
    })).toEqual({
      event: '$pageview',
      properties: {
        $current_url: 'https://www.nello.com.br/nutritionist/patients/:patient/meal-plan',
        route: '/nutritionist/patients/:patient/anthropometry',
        error: 'Contact [EMAIL] for [UUID]',
        app_release: '0.0.0',
        environment: 'test',
      },
    });
  });
});
