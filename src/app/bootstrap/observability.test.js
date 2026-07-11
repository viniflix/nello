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
});
