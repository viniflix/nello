// Local diagnostics never serialize request bodies, messages, stacks or records.
// Call-site names are static source identifiers; remote telemetry remains separate.
const codes = new Set(['42501', '22P02', '22023', '23503', '23505', 'P0001', 'PGRST116', 'PGRST202', 'PGRST204']);
const names = new Set(['Error', 'TypeError', 'RangeError', 'AbortError', 'AuthApiError', 'AuthRetryableFetchError']);
const levels = new Set(['error', 'warn', 'log', 'info', 'debug']);

export function logDiagnostic(level, operation, ...values) {
  const diagnostic = { operation: /^[a-zA-Z0-9_.:/-]{1,180}$/.test(operation) ? operation : 'unknown_operation' };
  for (const value of values) {
    if (!value || typeof value !== 'object') continue;
    if (codes.has(value.code)) diagnostic.code = value.code;
    if (names.has(value.name)) diagnostic.name = value.name;
    const status = value.status ?? value.statusCode;
    if (Number.isInteger(status) && status >= 100 && status <= 599) diagnostic.status = status;
    if (typeof value.correlationId === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value.correlationId)) diagnostic.correlationId = value.correlationId;
  }
  console[levels.has(level) ? level : 'error']('[Nello] Technical diagnostic', diagnostic);
  return diagnostic;
}
