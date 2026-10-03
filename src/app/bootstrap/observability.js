import {
  browserTracingIntegration,
  init,
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
    .replace(/(\/?[^\s?#]+)[?#][^\s]*/gi, '$1?[REDACTED]');
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
  const select = (value, keys) => Object.fromEntries(Object.entries(value || {}).filter(([key])=>keys.includes(key)));
  const result = select(scrubValue(event), ['event_id','timestamp','type','level','platform','release','environment','sdk','user','request','tags','contexts','exception','extra','breadcrumbs','fingerprint','transaction','start_timestamp','spans','op','status','span_id','trace_id','parent_span_id','data']);
  if (event.fingerprint?.length === 3 && event.fingerprint[0] === 'connectivity-incident' && technicalIdentity(event.fingerprint[1]) && /^\d{1,10}$/.test(event.fingerprint[2])) {
    result.fingerprint = [...event.fingerprint];
  }
  if(result.user)result.user=select(result.user,['id']);
  if(result.request)result.request=select(result.request,['url','method','document_url']);
  if(result.tags)result.tags=select(result.tags,['correlation.id','session.id','user.type','user.is_admin','error.source','error.module','error.code','error.reason','http.status_code']);
  if(result.contexts){
    result.contexts=select(result.contexts,['operation','trace','browser','os','runtime','device']);
    for(const [key,value]of Object.entries(result.contexts))result.contexts[key]=select(value,key==='operation'?['correlation_id','session_id','operation','module','source','error_code','failure_reason','failure_kind','cause_reason','http_status','route']:['name','version','trace_id','span_id','parent_span_id','op','status','origin','architecture']);
  }
  if(result.data)result.data=select(result.data,['http.request.method','http.response.status_code','server.address','url.scheme']);
  if(result.spans)result.spans=result.spans.map(scrubSentryEvent);
  // Arbitrary extras may contain clinical free text without recognizable identifiers.
  if (result.extra) result.extra = {};
  if (result.exception) result.exception = { values: (result.exception.values || []).map(error => select(error, ['type', 'value', 'mechanism', 'stacktrace'])) };
  for (const error of result?.exception?.values || []) {
    if(error.mechanism)error.mechanism=select(error.mechanism,['type','handled']);
    if(error.stacktrace)error.stacktrace={frames:(error.stacktrace.frames || []).map(frame=>select(frame,['filename','abs_path','function','module','lineno','colno','in_app']))};
    if (typeof error.value === 'string' && !/^(?:\[[A-Z0-9_]+\] )?[a-z0-9_.:-]+ failed \([a-z_]+\)$/i.test(error.value)) {
      error.value = 'Unhandled application error (content removed)';
    }
  }
  return result;
}

export function scrubBreadcrumb(breadcrumb) {
  if (!['navigation', 'http', 'fetch', 'xhr'].includes(breadcrumb?.category)) return null;
  const safe = {category:breadcrumb.category,type:breadcrumb.type,timestamp:breadcrumb.timestamp,data:scrubValue(breadcrumb.data || {})};
  safe.data = Object.fromEntries(Object.entries(safe.data || {}).filter(([key]) => ['from', 'to', 'url', 'method', 'status_code'].includes(key)));
  return safe;
}

export function createSentryOptions(env) {
  if (!env.VITE_SENTRY_DSN) return null;

  const integrations = [browserTracingIntegration()];

  return {
    dsn: env.VITE_SENTRY_DSN,
    environment: env.MODE || 'production',
    release: env.VITE_APP_RELEASE || undefined,
    sendDefaultPii: false,
    integrations,
    tracesSampleRate: 0.1,
    tracePropagationTargets: [],
    replaysSessionSampleRate: 0,
    // No reviewed legal/capture allowlist exists yet: an environment flag cannot authorize recording.
    replaysOnErrorSampleRate: 0,
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
