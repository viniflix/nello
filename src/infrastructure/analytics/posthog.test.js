import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sanitizeAnalyticsProperties, sanitizePosthogEvent } from './posthog';
vi.mock('posthog-js', () => ({ default: { capture: vi.fn(), get_session_id: () => '018d3b7f-81d8-7abc-8f12-aabbccddeeff' } }));

describe('sanitizeAnalyticsProperties', () => {
  it('preserves correlation through track and the final SDK sanitizer without sending arbitrary text', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', 'test-key');
    const { default: sdk, track } = await import('./posthog');
    const id = '9ba45c9b-d0d4-490d-96a0-6addd7826833';
    track('operation_failed', { correlation_id: id, payload: 'private clinical text' });
    const [event, properties] = sdk.capture.mock.calls.at(-1);
    const final = sanitizePosthogEvent({ event, properties });
    expect(final.properties.correlation_id).toBe(id);
    expect(final.properties.session_id).toBe('018d3b7f-81d8-7abc-8f12-aabbccddeeff');
    expect(JSON.stringify(final)).not.toContain('private clinical text');
  });
  it('preserves distinct users and v7 sessions while denying arbitrary payloads and person properties', () => {
    const a = '9ba45c9b-d0d4-490d-96a0-6addd7826833';
    const b = '1ba45c9b-d0d4-490d-96a0-6addd7826833';
    const session = '018d3b7f-81d8-7abc-8f12-aabbccddeeff';
    const event = id => sanitizePosthogEvent({ event: 'operation_failed', properties: { distinct_id: id, '$session_id': session, correlation_id: a, payload: { unknown_clinical_text: 'secret' }, '$set': { user_type: 'patient', diagnosis: 'secret' } } });
    expect(event(a).properties.distinct_id).not.toBe(event(b).properties.distinct_id);
    expect(event(a).properties.$session_id).toBe(session);
    expect(event(a).properties.correlation_id).toBe(a);
    expect(JSON.stringify(event(a))).not.toContain('secret');
  });
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
        app_release: '0.0.0',
        environment: 'test',
      },
    });
  });

  it('redacts public form and document tokens by route shape', () => {
    expect(sanitizeAnalyticsProperties({
      form_url: 'https://nello.example/f/legacy-secret-token?source=email',
      document_url: '/verificar-documento/public-secret-code',
    })).toEqual({
      form_url: 'https://nello.example/f/:token',
      document_url: '/verificar-documento/:code',
    });
  });
});
