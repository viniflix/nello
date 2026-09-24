import { safeInternalPath } from './navigation';

const currentOrigins = new Set([
  'https://nellonutri.com.br',
  'https://www.nellonutri.com.br',
]);

// Absolute destinations are accepted only on current production or local origins.
export const safeAuthRedirect = (value, currentOrigin, fallback = '/login') => {
  if (typeof value !== 'string') return fallback;
  if (value.startsWith('/')) return safeInternalPath(value, fallback);
  try {
    const target = new URL(value);
    if (target.username || target.password) return fallback;
    const path = safeInternalPath(`${target.pathname}${target.search}${target.hash}`, fallback);
    if (currentOrigins.has(target.origin)) return path;
    const local = new URL(currentOrigin);
    if (['localhost', '127.0.0.1'].includes(local.hostname)
      && target.origin === local.origin) return path;
    return fallback;
  } catch {
    return fallback;
  }
};
