import * as Sentry from '@sentry/react';
import {
  Events,
  identifyUser,
  resetUser,
  track,
} from '@/infrastructure/analytics/posthog';

const recentErrors = new Map();
const DEDUPLICATION_WINDOW_MS = 5000;

function normalizeError(error, operation = 'operation') {
  const code = error?.code ? `[${String(error.code)}] ` : '';
  const normalized = new Error(`${code}${operation} failed`);
  normalized.name = error?.name || 'OperationalError';
  return normalized;
}

function safeStatus(error) {
  const value = Number(error?.status || error?.statusCode);
  return Number.isFinite(value) ? value : null;
}

function correlationId() {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `obs-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function shouldCapture(key, now = Date.now()) {
  const previous = recentErrors.get(key);
  recentErrors.set(key, now);

  for (const [entry, timestamp] of recentErrors) {
    if (now - timestamp > DEDUPLICATION_WINDOW_MS) recentErrors.delete(entry);
  }

  return !previous || now - previous > DEDUPLICATION_WINDOW_MS;
}

export function setObservabilityUser(user) {
  if (!user?.id) return;

  const role = user.profile?.user_type || 'unknown';
  Sentry.setUser({ id: user.id });
  Sentry.setTag('user.type', role);
  Sentry.setTag('user.is_admin', String(user.profile?.is_admin === true));
  identifyUser(user);
}

export function clearObservabilityUser() {
  Sentry.setUser(null);
  resetUser();
}

export function captureOperationalError(error, context = {}) {
  const operation = String(context.operation || 'unknown_operation').slice(0, 120);
  const normalized = normalizeError(error, operation);
  const module = String(context.module || 'unknown').slice(0, 80);
  const source = String(context.source || 'application').slice(0, 40);
  const errorCode = error?.code ? String(error.code).slice(0, 40) : 'unknown';
  const status = safeStatus(error);
  const route = typeof window !== 'undefined' ? window.location.pathname : 'server';
  const id = correlationId();
  const deduplicationKey = `${source}:${module}:${operation}:${errorCode}:${status || ''}`;

  if (!shouldCapture(deduplicationKey)) return null;

  const properties = {
    correlation_id: id,
    operation,
    module,
    source,
    error_code: errorCode,
    http_status: status,
    route,
  };

  Sentry.withScope((scope) => {
    scope.setFingerprint(['operational-error', source, module, operation, errorCode]);
    scope.setLevel(status === 403 || errorCode === '42501' ? 'warning' : 'error');
    scope.setTags({
      'correlation.id': id,
      'error.source': source,
      'error.module': module,
      'error.code': errorCode,
      'http.status_code': status || 'unknown',
    });
    scope.setContext('operation', properties);
    Sentry.captureException(normalized);
  });

  track(Events.OPERATION_FAILED, properties);
  return id;
}

export const __testing = {
  normalizeError,
  shouldCapture,
};
