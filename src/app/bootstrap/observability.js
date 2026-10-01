import {
  browserTracingIntegration,
  init,
  replayIntegration,
} from '@sentry/react';
import { technicalIdentity } from '@/infrastructure/observability/technicalIdentity';

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
  'password',
  'token',
  'access_token',
  'refresh_token',
  'body',
  'vars',
  'patient_id',
]);

function normalizeKey(key) {
  return key.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
}

function scrubString(value) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]')
    .replace(/(\/patients\/)[^/?#\s]+/gi, '$1:patient')
    .replace(/(\/f\/)[^/?#\s]+/gi, '$1:token')
    .replace(/(\/verificar-documento\/)[^/?#\s]+/gi, '$1:code')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[UUID]')
    .replace(/(https?:\/\/[^\s?#]+)[?#][^\s]*/gi, '$1?[REDACTED]');
}

function scrubValue(value, path = '') {
  if (['user.id', 'tags.correlation.id', 'tags.session.id', 'contexts.operation.correlation_id', 'contexts.operation.session_id'].includes(path) && technicalIdentity(value)) return value;
  if (Array.isArray(value)) return value.map(nested => scrubValue(nested, path));
  if (typeof value === 'string') return scrubString(value);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEYS.has(normalizeKey(key)))
      .map(([key, nestedValue]) => [key, scrubValue(nestedValue, path ? `${path}.${key}` : key)]),
  );
}

export function scrubSentryEvent(event) {
  const result = scrubValue(event);
  // Arbitrary extras may contain clinical free text without recognizable identifiers.
  if (result.extra) result.extra = {};
  for (const error of result?.exception?.values || []) {
    if (typeof error.value === 'string' && !/^(?:\[[A-Z0-9_]+\] )?[a-z0-9_.:-]+ failed \([a-z_]+\)$/i.test(error.value)) {
      error.value = 'Unhandled application error (content removed)';
    }
  }
  return result;
}

export function scrubBreadcrumb(breadcrumb) {
  if (!['navigation', 'http', 'fetch', 'xhr'].includes(breadcrumb?.category)) return null;
  const safe = scrubSentryEvent(breadcrumb);
  delete safe.message;
  safe.data = Object.fromEntries(Object.entries(safe.data || {}).filter(([key]) => ['from', 'to', 'url', 'method', 'status_code'].includes(key)));
  return safe;
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
    beforeSendTransaction: scrubSentryEvent,
    beforeSendSpan: scrubSentryEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}

export function initializeObservability(env) {
  const options = createSentryOptions(env);
  if (!options) return false;

  init(options);
  return true;
}
