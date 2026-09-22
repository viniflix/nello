import { safeInternalPath } from './navigation';

const migrationOrigins = new Set([
  'https://nellonutri.com.br',
  'https://www.nellonutri.com.br',
  'https://hipozero.com.br',
  'https://www.hipozero.com.br',
]);

// Old email links must finish authentication on the current application origin.
export const safeAuthRedirect = (value, currentOrigin, fallback = '/login') => {
  if (typeof value !== 'string') return fallback;
  if (value.startsWith('/')) return safeInternalPath(value, fallback);
  try {
    const target = new URL(value);
    if (target.username || target.password) return fallback;
    if (target.origin !== currentOrigin && !migrationOrigins.has(target.origin)) return fallback;
    return safeInternalPath(`${target.pathname}${target.search}${target.hash}`, fallback);
  } catch {
    return fallback;
  }
};
