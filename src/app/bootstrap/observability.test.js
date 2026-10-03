import { describe, expect, it } from 'vitest';
import {
  createSentryOptions,
  scrubSentryEvent,
  scrubBreadcrumb,
} from './observability';

describe('createSentryOptions', () => {
  it('disables Sentry when no DSN is configured', () => {
    expect(createSentryOptions({})).toBeNull();
  });

  it('uses data-minimizing defaults', () => {
    const options = createSentryOptions({ VITE_SENTRY_DSN: 'https://public@example.invalid/1' });

    expect(options).toMatchObject({
      dsn: 'https://public@example.invalid/1',
      sendDefaultPii: false,
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      tracePropagationTargets: [],
    });
  });

  it('does not let a deployment flag bypass the legal and capture review', () => {
    const options = createSentryOptions({
      VITE_SENTRY_DSN: 'https://public@example.invalid/1',
      VITE_SENTRY_REPLAY_ENABLED: 'true',
    });

    expect(options.replaysSessionSampleRate).toBe(0);
    expect(options.replaysOnErrorSampleRate).toBe(0);
  });
});

describe('scrubSentryEvent', () => {
  it('keeps the reviewed technical session in connectivity grouping without preserving arbitrary UUID fingerprints',()=>{
    const id='019bd130-48ba-7fab-a6b7-809ad87b48e1';
    expect(scrubSentryEvent({fingerprint:['connectivity-incident',id,'12345']}).fingerprint[1]).toBe(id);
    expect(scrubSentryEvent({fingerprint:['unreviewed',id]}).fingerprint[1]).toBe('[UUID]');
  });
  it('drops unclassified root, context, tag and span data fields',()=>{
    const safe=scrubSentryEvent({unknown:'PRIVATE_SENTINEL',tags:{clinical_label:'PRIVATE_SENTINEL'},contexts:{unreviewed:{answer:'PRIVATE_SENTINEL'},operation:{unknown:'PRIVATE_SENTINEL',operation:'meal_plan_apply'}},spans:[{op:'http',data:{unreviewed:'PRIVATE_SENTINEL','http.response.status_code':500}}]});
    expect(JSON.stringify(safe)).not.toContain('PRIVATE_SENTINEL');expect(safe.spans[0].data['http.response.status_code']).toBe(500);
  });
  it('drops unclassified extras and masks UUIDv7 outside technical identity fields', () => {
    const id = '019bd130-48ba-7fab-a6b7-809ad87b48e1';
    const result = scrubSentryEvent({ user: { id }, extra: { arbitrary: 'clinical free text', measurement: 180 }, request: { url: `https://example.invalid/resource/${id}` } });
    expect(result.user.id).toBe(id);
    expect(result.extra).toEqual({});
    expect(result.request.url).toBe('https://example.invalid/resource/[UUID]');
  });
  it('keeps user/session/correlation UUIDs while masking clinical references and raw exception text', () => {
    const id = '9ba45c9b-d0d4-490d-96a0-6addd7826833';
    const result = scrubSentryEvent({ user: { id }, tags: { 'correlation.id': id, 'session.id': id }, contexts: { operation: { correlation_id: id, session_id: id } }, extra: { reference: id }, exception: { values: [{ value: 'Clinical secret without email or UUID', stacktrace: { frames: [{ function: 'save', vars: { token: 'secret' } }] } }] } });
    expect(result.user.id).toBe(id);
    expect(result.tags['correlation.id']).toBe(id);
    expect(result.contexts.operation.session_id).toBe(id);
    expect(result.extra).toEqual({});
    expect(JSON.stringify(result)).not.toContain('Clinical secret');
    expect(result.exception.values[0].stacktrace.frames[0]).toEqual({ function: 'save' });
    expect(scrubBreadcrumb({ category: 'console', message: 'clinical text' })).toBeNull();
  });
  it('removes direct and nested sensitive data without mutating the source', () => {
    const event = {
      user: { id: 'internal-user', email: 'patient@example.com', ip_address: '127.0.0.1' },
      request: {
        cookies: { session: 'secret' },
        headers: { authorization: 'Bearer secret' },
        query_string: 'patient=123',
      },
      extra: {
        patient_name: 'Maria',
        clinical: { diagnosis: 'sensitive', safe_count: 2 },
      },
    };

    const sanitized = scrubSentryEvent(event);

    expect(sanitized).toEqual({
      user: { id: 'internal-user' },
      request: {},
      extra: {},
    });
    expect(event.user.email).toBe('patient@example.com');
  });

  it('redacts public access tokens even when they are not UUIDs', () => {
    const sanitized = scrubSentryEvent({
      request: {
        url: 'https://nello.example/f/legacy-secret-token?source=email',
        document_url: 'https://nello.example/verificar-documento/public-secret-code',
      },
    });

    expect(sanitized.request.url).toBe('https://nello.example/f/:token?[REDACTED]');
    expect(sanitized.request.document_url).toBe('https://nello.example/verificar-documento/:code');
  });
});
