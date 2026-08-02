import {
  browserTracingIntegration,
  init,
  replayIntegration,
} from '@sentry/react';

const SENSITIVE_KEYS = new Set([
  'address',
  'authorization',
  'content',
  'cookie',
  'cookies',
  'cpf',
  'diagnosis',
  'details',
  'email',
  'headers',
  'hint',
  'ip_address',
  'message',
  'name',
  'notes',
  'patient_name',
  'phone',
  'query_string',
  'username',
]);

function normalizeKey(key) {
  return key.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
}

function scrubString(value) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]')
    .replace(/(\/patients\/)[^/?#\s]+/gi, '$1:patient')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[UUID]')
    .replace(/(https?:\/\/[^\s?#]+)[?#][^\s]*/gi, '$1?[REDACTED]');
}

function scrubValue(value) {
  if (Array.isArray(value)) return value.map(scrubValue);
  if (typeof value === 'string') return scrubString(value);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEYS.has(normalizeKey(key)))
      .map(([key, nestedValue]) => [key, scrubValue(nestedValue)]),
  );
}

export function scrubSentryEvent(event) {
  return scrubValue(event);
}

export function createSentryOptions(env) {
  if (!env.VITE_SENTRY_DSN) return null;

  const replayEnabled = env.VITE_SENTRY_REPLAY_ENABLED === 'true';
  const integrations = [browserTracingIntegration()];

  if (replayEnabled) {
    integrations.push(replayIntegration({ maskAllText: true, blockAllMedia: true }));
  }

  return {
    dsn: env.VITE_SENTRY_DSN,
    environment: env.MODE || 'production',
    release: env.VITE_APP_RELEASE || undefined,
    sendDefaultPii: false,
    integrations,
    tracesSampleRate: 0.1,
    tracePropagationTargets: [],
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: replayEnabled ? 1 : 0,
    beforeSend: scrubSentryEvent,
    beforeBreadcrumb: scrubSentryEvent,
  };
}

export function initializeObservability(env) {
  const options = createSentryOptions(env);
  if (!options) return false;

  init(options);
  return true;
}
