export function isTransientNetworkError(error) {
  return error?.name !== 'AbortError' && !Number(error?.status || error?.statusCode)
    && /failed to fetch|networkerror|network request failed|load failed/i.test(String(error?.message || ''));
}

/** Only explicit read factories may use this helper; writes are never retried. */
export async function retryNetworkRead(read, mayRetry = () => true, { httpStatuses = [] } = {}) {
  const transient = (error, status) => isTransientNetworkError(error)
    || (error?.name !== 'AbortError' && httpStatuses.includes(Number(status || error?.status || error?.statusCode)));
  let result;
  try { result = await read(); }
  catch (error) {
    if (!transient(error) || !await mayRetry()) throw error;
    return read();
  }
  if (result?.error && transient(result.error, result.status) && await mayRetry()) return read();
  return result;
}
