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
  'email',
  'headers',
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

function scrubValue(value) {
  if (Array.isArray(value)) return value.map(scrubValue);
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
    sendDefaultPii: false,
    integrations,
    tracesSampleRate: 0.1,
    tracePropagationTargets: [],
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: replayEnabled ? 0.1 : 0,
    beforeSend: scrubSentryEvent,
  };
}

export function initializeObservability(env) {
  const options = createSentryOptions(env);
  if (!options) return false;

  init(options);
  return true;
}
