const PRIVATE_DRAFT_PREFIXES = ['nello_shadow:', 'nello_anamnesis:', 'nello_public_anamnesis:'];

/** Remove only clinical working copies from the current browser tab on logout. */
export function clearPrivateDraftStorage(storage = typeof window === 'undefined' ? null : window.sessionStorage) {
  if (!storage) return;
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key && PRIVATE_DRAFT_PREFIXES.some((prefix) => key.startsWith(prefix))) storage.removeItem(key);
  }
}
