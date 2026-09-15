import { describe, expect, it } from 'vitest';
import {
  createSentryOptions,
  scrubSentryEvent,
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

  it('captures every error replay only when explicitly enabled', () => {
    const options = createSentryOptions({
      VITE_SENTRY_DSN: 'https://public@example.invalid/1',
      VITE_SENTRY_REPLAY_ENABLED: 'true',
    });

    expect(options.replaysSessionSampleRate).toBe(0);
    expect(options.replaysOnErrorSampleRate).toBe(1);
  });
});

describe('scrubSentryEvent', () => {
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
      extra: { clinical: { safe_count: 2 } },
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
