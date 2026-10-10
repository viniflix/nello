import * as Sentry from '@sentry/react';
import { classifyFailure } from '@/lib/utils/failure';
import { isChunkLoadError } from '@/lib/utils/lazyWithReload';
import {
  Events,
  identifyUser,
  resetUser,
  getObservabilitySessionId,
  track,
} from '@/infrastructure/analytics/posthog';

const recentErrors = new Map();
const DEDUPLICATION_WINDOW_MS = 5000;

function safeFailureReason(error) {
  if (error?.code === 'PT503' && error?.message === 'security_audit_unavailable') return 'audit_recording_failed';
  if (isChunkLoadError(error)) return 'asset_load_failure';
  const kind = classifyFailure(error);
  if (kind === 'offline' || kind === 'network') return 'network_failure';
  if (kind === 'timeout') return 'request_timeout';
  const message = typeof error?.message === 'string' ? error.message : '';
  const code = String(error?.code || '');
  if (error?.name === 'AbortError') return 'request_aborted';
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(message)) return 'network_failure';
  if (code === 'PGRST116') return 'record_missing';
  if (code === '42501' || Number(error?.status) === 403) return 'access_denied';
  if (code === '22P02' || code === '22023' || Number(error?.status) === 400) return 'invalid_input';
  if (code === '23503') return 'missing_reference';
  if (code === '23505') return 'conflict';
  if (code === 'P0001') return 'business_rule_rejected';
  return ({forbidden:'access_denied',validation:'invalid_input',conflict:'conflict',missing:'record_missing',unauthenticated:'session_expired',rate_limit:'rate_limited'})[kind] || 'unclassified';
}

function normalizeError(error, operation = 'operation') {
  const code = /^[A-Z0-9_]{1,40}$/.test(String(error?.code || '')) ? `[${String(error.code)}] ` : '';
  const normalized = new Error(`${code}${operation} failed (${safeFailureReason(error)})`);
  normalized.name = ['TypeError', 'RangeError', 'AbortError', 'Error'].includes(error?.name) ? error.name : 'OperationalError';
  if (typeof error?.stack === 'string') normalized.stack = `${normalized.name}: ${normalized.message}\n${error.stack.split('\n').filter(line => /^\s+at /.test(line)).join('\n')}`;
  return normalized;
}

function safeStatus(error) {
  const value = Number(error?.status || error?.statusCode || error?.cause?.status || error?.cause?.statusCode);
  return Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;
}

function correlationId() {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `obs-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function shouldCapture(key, now = Date.now()) {
  const previous = recentErrors.get(key);

  for (const [entry, timestamp] of recentErrors) {
    if (now - timestamp > DEDUPLICATION_WINDOW_MS) recentErrors.delete(entry);
  }

  if(previous !== undefined && now >= previous && now - previous <= DEDUPLICATION_WINDOW_MS)return false;
  recentErrors.set(key,now);
  return true;
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
  recentErrors.clear();
  Sentry.setTag('user.type', 'anonymous');
  Sentry.setTag('user.is_admin', 'false');
  Sentry.setTag('session.id', '');
}

export function captureOperationalError(error, context = {}) {
  if (classifyFailure(error) === 'aborted') return null;
  const operation = /^[a-z0-9_.:-]{1,120}$/i.test(context.operation || '') ? context.operation : 'unknown_operation';
  const normalized = normalizeError(error, operation);
  const module = String(context.module || 'unknown').slice(0, 80);
  const source = String(context.source || 'application').slice(0, 40);
  const errorCode = /^[A-Z0-9_]{1,40}$/.test(String(error?.code || '')) ? String(error.code) : 'unknown';
  const failureReason = safeFailureReason(error);
  const failureKind = ['validation','conflict','forbidden','missing','unauthenticated','rate_limit'].includes(classifyFailure(error)) || failureReason === 'business_rule_rejected' ? 'expected' : 'technical';
  const status = safeStatus(error);
  const route = typeof window !== 'undefined' ? window.location.pathname : 'server';
  const id = correlationId();
  const deduplicationKey = `${source}:${module}:${operation}:${errorCode}:${failureReason}:${status || ''}`;

  if (!shouldCapture(deduplicationKey)) return null;

  const properties = {
    correlation_id: id,
    session_id: getObservabilitySessionId(),
    operation,
    module,
    source,
    error_code: errorCode,
    failure_reason: failureReason,
    failure_kind: failureKind,
    cause_reason: error?.cause ? safeFailureReason(error.cause) : failureReason,
    http_status: status,
    route,
  };

  Sentry.withScope((scope) => {
    scope.setFingerprint(failureReason === 'network_failure'
      ? ['connectivity-incident', properties.session_id || 'anonymous', String(Math.floor(Date.now() / 60000))]
      : ['operational-error', source, module, operation, errorCode, failureReason]);
    scope.setLevel(failureKind === 'expected' ? 'warning' : 'error');
    scope.setTags({
      'correlation.id': id,
      'session.id': properties.session_id || 'unavailable',
      'error.source': source,
      'error.module': module,
      'error.code': errorCode,
      'error.reason': failureReason,
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
