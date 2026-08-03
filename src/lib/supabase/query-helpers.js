import { captureOperationalError } from '@/infrastructure/observability/telemetry';

export const isExpectedRequestCancellation = (error, signal) => {
  if (signal?.aborted) return true;

  const name = String(error?.name || '').toLowerCase();
  const message = String(error?.message || error || '').toLowerCase();
  return name === 'aborterror'
    || message.includes('operation was aborted')
    || message.includes('request was aborted')
    || message.includes('signal is aborted');
};

export const logSupabaseError = (context, error) => {
  const msg = error?.message || String(error);
  console.error(`[Supabase] ${context}:`, msg, error?.code ? { code: error.code } : '');
  return captureOperationalError(error, {
    operation: context,
    module: 'supabase_query',
    source: 'supabase',
  });
};

export const normalizeEventName = (eventName, fallback = 'unknown.event') => {
  if (typeof eventName !== 'string') return fallback;
  const normalized = eventName.trim().toLowerCase();
  return normalized || fallback;
};

export const buildActivityEventPayload = ({
  eventName,
  eventVersion = 1,
  sourceModule = null,
  patientId = null,
  nutritionistId = null,
  payload = {}
}) => {
  return {
    event_name: normalizeEventName(eventName),
    event_version: Number.isFinite(eventVersion) ? Math.max(1, Number(eventVersion)) : 1,
    source_module: sourceModule || null,
    patient_id: patientId || null,
    nutritionist_id: nutritionistId || null,
    payload: payload && typeof payload === 'object' ? payload : {}
  };
};

