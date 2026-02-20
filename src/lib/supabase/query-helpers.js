export const logSupabaseError = (context, error) => {
  console.error(`[Supabase] ${context}:`, error);
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

