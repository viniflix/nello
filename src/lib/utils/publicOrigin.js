export const PRODUCTION_ORIGIN = 'https://nellonutri.com.br';

// Local auth emails must return to the local app; every deployed link uses the
// canonical host, even when opened through an old domain or a preview URL.
export const publicOrigin = (currentOrigin = typeof window === 'undefined' ? undefined : window.location.origin) => {
  try {
    const url = new URL(currentOrigin);
    if (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)) {
      return url.origin;
    }
  } catch {
    // No browser location (or a malformed origin) falls back to production.
  }
  return PRODUCTION_ORIGIN;
};
