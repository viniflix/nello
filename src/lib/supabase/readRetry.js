import { readRequest } from './readRequest';
import { readPolicies } from '@/lib/utils/readPolicy';
export function isTransientNetworkError(error) {
  return error?.name !== 'AbortError' && !Number(error?.status || error?.statusCode)
    && /failed to fetch|networkerror|network request failed|load failed/i.test(String(error?.message || ''));
}

/** Explicit read factory; this helper owns retries, not the SDK or Query. */
export function retryNetworkRead(read, mayRetry = () => true, { httpStatuses = [], signal } = {}) {
  return readRequest(read, { policy: readPolicies.clinical, mayRetry, httpStatuses, signal, rpcRead:true });
}
