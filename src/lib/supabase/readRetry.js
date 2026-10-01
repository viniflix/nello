export function isTransientNetworkError(error) {
  return error?.name !== 'AbortError' && !Number(error?.status || error?.statusCode)
    && /failed to fetch|networkerror|network request failed|load failed/i.test(String(error?.message || ''));
}

/** Only explicit read factories may use this helper; writes are never retried. */
export async function retryNetworkRead(read, mayRetry = () => true) {
  let result;
  try { result = await read(); }
  catch (error) {
    if (!isTransientNetworkError(error) || !await mayRetry()) throw error;
    return read();
  }
  if (isTransientNetworkError(result?.error) && await mayRetry()) return read();
  return result;
}
