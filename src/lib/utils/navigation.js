const hasControlCharacter = (value) => Array.from(value).some((character) => {
  const code = character.charCodeAt(0);
  return code <= 31 || code === 127;
});

/**
 * Accepts only same-origin application paths before passing database-provided
 * navigation targets to React Router.
 */
export const safeInternalPath = (value, fallback = '/') => {
  if (typeof value !== 'string') return fallback;

  const path = value.trim();
  if (!path.startsWith('/') || path.startsWith('//') || hasControlCharacter(path)) {
    return fallback;
  }

  let decodedPath = path;
  try {
    decodedPath = decodeURIComponent(path);
  } catch {
    return fallback;
  }

  if (decodedPath.startsWith('//') || decodedPath.includes('\\')) return fallback;

  try {
    const base = new URL('https://nello.invalid');
    const target = new URL(path, base);
    if (target.origin !== base.origin) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
};

/**
 * Returns an absolute HTTP(S) URL suitable for an external anchor. Values from
 * catalogs and other remote sources must not be trusted as executable hrefs.
 */
export const safeExternalHttpUrl = (value) => {
  if (typeof value !== 'string' || hasControlCharacter(value)) return null;

  try {
    const target = new URL(value.trim());
    return target.protocol === 'https:' || target.protocol === 'http:' ? target.href : null;
  } catch {
    return null;
  }
};
