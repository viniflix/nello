import { classifyFailure } from './failure';

const owned = Symbol.for('nello.read-policy-owner');
const retryHint = Symbol.for('nello.read-retry-after');
export function recordRetryAfter(error, header) {
  if (!error || !Object.isExtensible(error) || header == null) return;
  const ms = Number.isFinite(Number(header)) ? Number(header) * 1000 : Date.parse(header) - Date.now();
  if (Number.isFinite(ms) && ms >= 0) Object.defineProperty(error, retryHint, {value:ms, configurable:true});
}
export const readPolicies = Object.freeze({
  collection: { deadlineMs: 30000, maxAttempts: 1 },
  edge: { deadlineMs: 15000, maxAttempts: 1 },
  agenda: { deadlineMs: 20000, maxAttempts: 1 },
  agendaPage: { deadlineMs: 8000, maxAttempts: 2 },
  reference: { deadlineMs: 8000, maxAttempts: 2 },
  search: { deadlineMs: 6000, maxAttempts: 2 },
  clinical: { deadlineMs: 15000, maxAttempts: 2 },
  profile: { deadlineMs: 10000, maxAttempts: 5 },
  admin: { deadlineMs: 15000, maxAttempts: 2 },
  provider: { deadlineMs: 6000, maxAttempts: 1 },
  asset: { deadlineMs: 15000, maxAttempts: 1 },
});

export function readCancellation(signal) {
  const timeout = signal?.reason?.name === 'TimeoutError';
  return new DOMException(timeout ? 'read_deadline' : 'read_cancelled', timeout ? 'TimeoutError' : 'AbortError');
}
export function ownsReadPolicy(error) { return Boolean(error?.[owned]); }
function markFailure(error, status) {
  // Error identity is part of several Result contracts. Technical ownership is
  // non-enumerable and never added to DTOs or telemetry payloads.
  const copy = error && typeof error === 'object' && Object.isExtensible(error) ? error
    : error instanceof Error ? new Error(error.message) : { ...error };
  if (copy !== error && error?.name) Object.defineProperty(copy, 'name', {value:error.name});
  for (const key of ['code', 'status', 'statusCode']) if (copy !== error && error?.[key] !== undefined) copy[key] = error[key];
  if (status && !copy.status) Object.defineProperty(copy, 'status', { value: status });
  Object.defineProperty(copy, owned, { value: true });
  return copy;
}

export function retryableRead(error, status, statuses = [502, 503, 504, 520]) {
  const kind = classifyFailure(error);
  if (['aborted', 'unauthenticated', 'forbidden', 'validation', 'conflict', 'missing', 'rate_limit'].includes(kind)) return false;
  const http = Number(status || error?.status || error?.statusCode);
  return http ? statuses.includes(http) : ['network', 'offline'].includes(kind);
}
export function queryReadRetry(failureCount, error) {
  return !ownsReadPolicy(error) && failureCount < 1 && retryableRead(error);
}
// A composed QueryFn gets one total deadline. Its explicit SDK read factories
// own per-request attempts; wrapping never replays the entire multi-source load.
export function queryRead(load) {
  return (context = {}) => executeRead(signal => load({ ...context, signal }),
    { signal:context.signal, policy:readPolicies.collection });
}
function bounded(work, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(readCancellation(signal));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { signal.removeEventListener('abort', abort); abort(); return; }
    let result;
    try { signal.throwIfAborted(); result = work(); } catch (error) { signal.removeEventListener('abort', abort); reject(error); return; }
    Promise.resolve(result).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(readCancellation(signal)); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

// Explicit read factories only. Deadline includes attempts, authorization checks,
// response decoding and backoff. Racing also bounds transports that ignore abort.
export async function executeRead(load, { signal, additionalSignal, policy = readPolicies.clinical, mayRetry = () => true,
  retryWhen, httpStatuses, backoffMs = 200, backoffCapMs = 800 } = {}) {
  const controller = new AbortController();
  const links=[...new Set([signal,additionalSignal].filter(Boolean))].map(source=>{
    const cancel=()=>controller.abort(source.reason);
    source.addEventListener('abort',cancel,{once:true});
    if(source.aborted)cancel();
    return()=>source.removeEventListener('abort',cancel);
  });
  const endsAt = Date.now() + policy.deadlineMs;
  const timer = setTimeout(() => controller.abort(new DOMException('read_deadline', 'TimeoutError')), policy.deadlineMs);
  try {
    for (let attempt = 1; ; attempt++) {
      let result, thrown, error, status;
      try { result = await bounded(() => load(controller.signal, attempt), controller.signal); error = result?.error; status = result?.status; }
      catch (failure) { thrown = true; error = failure; }
      if (controller.signal.aborted) throw readCancellation(controller.signal);
      if (!error) return result;
      const allowed = retryWhen ? retryWhen(error, attempt, status) : retryableRead(error, status, httpStatuses);
      if (attempt >= policy.maxAttempts || !allowed || !await bounded(mayRetry, controller.signal)) {
        const failure = markFailure(error, status);
        if (thrown) throw failure;
        return failure === result.error ? result : { ...result, error: failure };
      }
      const header = error?.context?.headers?.get?.('Retry-After') || result?.response?.headers?.get?.('Retry-After');
      const requested = error?.[retryHint] ?? (header == null ? 0 : Number.isFinite(Number(header)) ? Number(header) * 1000 : Date.parse(header) - Date.now());
      const wait = Math.max(Math.min(backoffMs * 2 ** (attempt - 1), backoffCapMs), Number.isFinite(requested) ? requested : 0);
      if (wait >= endsAt - Date.now()) {
        const failure = markFailure(error, status);
        if (thrown) throw failure;
        return failure === result.error ? result : { ...result, error: failure };
      }
      await pause(wait, controller.signal);
    }
  } catch (error) {
    throw markFailure(controller.signal.aborted ? readCancellation(controller.signal) : error);
  } finally {
    clearTimeout(timer); links.forEach(unlink=>unlink());
    // Close remaining sibling reads after terminal completion of a composed load.
    if (!controller.signal.aborted) controller.abort(new DOMException('read_closed', 'AbortError'));
  }
}
