import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sanitizeAnalyticsProperties, sanitizePosthogEvent } from './posthog';
vi.mock('./lazyPosthog', () => ({ default: { capture: vi.fn(), get_session_id: () => '018d3b7f-81d8-7abc-8f12-aabbccddeeff' } }));

describe('sanitizeAnalyticsProperties', () => {
  it('resets identity on logout while remembering the independent public browser choice', async () => {
    vi.resetModules(); vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', 'test-key');
    const { identifyUser, resetUser } = await import('./posthog');
    const consent = await import('@/features/privacy/consent');
    localStorage.clear(); consent.bindConsentOwner(null); consent.storeAnalyticsChoice(false);
    consent.bindConsentOwner('logout-account'); consent.storeAnalyticsChoice(true);
    identifyUser({ id: 'logout-account', profile: { user_type: 'nutritionist' } });
    resetUser();
    expect(consent.hasAnalyticsChoice()).toBe(true);
    expect(consent.hasAnalyticsConsent()).toBe(false);
    expect(consent.hasAnalyticsConsent('logout-account')).toBe(false);
    consent.bindConsentOwner('unrelated-account');
    expect(consent.hasAnalyticsChoice()).toBe(false);
    expect(consent.hasAnalyticsConsent()).toBe(false);
  });
  it('drops nontechnical identities and nested payloads disguised as SDK metadata',()=>{
    const result=sanitizePosthogEvent({event:'$pageview',properties:{distinct_id:'PRIVATE_SENTINEL', $browser:{unexpected:'PRIVATE_SENTINEL'},$current_url:{unexpected:'PRIVATE_SENTINEL'}}});
    expect(JSON.stringify(result)).not.toContain('PRIVATE_SENTINEL');
  });
  it('rejects arbitrary person trait values even under an allowed key', () => {
    const result = sanitizePosthogEvent({ event: '$identify', properties: { $set: { user_type: 'PRIVATE_SENTINEL', is_admin: 'PRIVATE_SENTINEL' } } });
    expect(result.properties.$set).toEqual({});
  });
  it('emits canonical clinical outcomes only after a confirmed successful action', async () => {
    vi.resetModules(); vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', 'test-key');
    const { default: sdk, track } = await import('./posthog');
    const { bindConsentOwner, storeAnalyticsChoice } = await import('@/features/privacy/consent');
    bindConsentOwner(null); storeAnalyticsChoice(true); sdk.capture.mockClear();
    for (const outcome of ['started', 'failed', 'succeeded']) track('ui_action_outcome', { operation: 'meal_plan_apply', outcome });
    expect(sdk.capture.mock.calls.filter(([event]) => event === 'meal_plan_published')).toHaveLength(1);
    expect(sdk.capture.mock.calls.at(-1)[1]).toMatchObject({ outcome: 'succeeded', event_schema_version: 1, audience: 'qa' });
  });
  it('rejects unregistered names and unknown root envelope fields',()=>{
    expect(sanitizePosthogEvent({event:'private clinical text',properties:{}})).toBeNull();
    const safe=sanitizePosthogEvent({event:'operation_failed',properties:{},unknown:'PRIVATE_SENTINEL'});
    expect(JSON.stringify(safe)).not.toContain('PRIVATE_SENTINEL');
  });
  it('minimizes root-level SDK person updates including initial URLs and arbitrary clinical fields', () => {
    const safe = sanitizePosthogEvent({ event: '$identify', properties: {}, $set: { user_type: 'patient', email: 'private@example.invalid', arbitrary: 'clinical secret' }, $set_once: { '$initial_current_url': 'https://example.invalid/f/secret-token', is_admin: false } });
    expect(safe.$set).toEqual({ user_type: 'patient' });
    expect(safe.$set_once).toEqual({ is_admin: false });
    expect(JSON.stringify(safe)).not.toContain('secret');
    expect(JSON.stringify(safe)).not.toContain('private@example');
  });
  it('preserves correlation through track and the final SDK sanitizer without sending arbitrary text', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', 'test-key');
    const { default: sdk, track } = await import('./posthog');
    const { storeAnalyticsChoice } = await import('@/features/privacy/consent');
    storeAnalyticsChoice(true);
    const id = '9ba45c9b-d0d4-490d-96a0-6addd7826833';
    track('operation_failed', { correlation_id: id, payload: 'private clinical text' });
    const [event, properties] = sdk.capture.mock.calls.at(-1);
    const final = sanitizePosthogEvent({ event, properties });
    expect(final.properties.correlation_id).toBe(id);
    expect(final.properties.session_id).toBe('018d3b7f-81d8-7abc-8f12-aabbccddeeff');
    expect(JSON.stringify(final)).not.toContain('private clinical text');
  });
  it('preserves only the configured SDK project routing key and rejects authentication tokens', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', 'phc_synthetic_project');
    const { sanitizePosthogEvent: sanitize } = await import('./posthog');
    const safe = sanitize({ event: 'operation_failed', properties: { token: 'phc_synthetic_project', access_token: 'private-auth', refresh_token: 'private-refresh' } });
    expect(safe.properties.token).toBe('phc_synthetic_project');
    expect(JSON.stringify(safe)).not.toContain('private-');
    expect(sanitize({ event: 'operation_failed', properties: { token: 'private-auth' } }).properties.token).toBeUndefined();
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
        $geoip_disable: true,
        route: '/nutritionist/patients/:patient/anthropometry',
        app_release: '0.0.0',
        environment: 'test',
        event_schema_version: 1,
        audience: 'qa',
        user_type: 'anonymous',
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
