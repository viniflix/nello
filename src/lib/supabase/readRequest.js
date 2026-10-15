import { executeRead, readPolicies, readCancellation, recordRetryAfter } from '@/lib/utils/readPolicy';

// Builders are lazy: capture an already supplied signal before binding our budget.
// Only these reviewed reads transfer retry ownership out of the SDK.
export function readRequest(create, { signal, policy = readPolicies.clinical, rpcRead = false, ...options } = {}) {
  if (signal?.aborted) return Promise.reject(readCancellation(signal));
  const first = create();
  const caller = signal || first?.signal;
  const additionalSignal = signal && first?.signal !== signal ? first?.signal : undefined;
  const budgetPolicy = first?.method === 'POST' && !rpcRead ? {...policy,maxAttempts:1} : policy;
  return executeRead(async (budget, attempt) => {
    let request = attempt === 1 ? first : create();
    if (typeof request?.retry === 'function') request = request.retry(false);
    if (typeof request?.abortSignal === 'function') request = request.abortSignal(budget);
    // Pinned PostgREST exposes its per-builder transport but drops response
    // headers from Result. Keep only the safe delay hint, never bodies/URLs/auth.
    const transport = request?.fetch;
    let hint;
    if (typeof transport === 'function') request.fetch = async (...args) => {
      const response = await transport(...args);
      hint = response.headers?.get('Retry-After');
      return response;
    };
    try { const result = await request; recordRetryAfter(result?.error, hint); return result; }
    finally { if (typeof transport === 'function') request.fetch = transport; }
  }, { signal: caller, additionalSignal, policy:budgetPolicy, ...options });
}
