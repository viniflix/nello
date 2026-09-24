const PRIVATE_DRAFT_PREFIXES = ['nello_shadow:', 'nello_anamnesis:', 'nello_public_anamnesis:'];
const PRIVATE_LOCAL_PREFIXES = ['anamnesis_step_'];
const PRIVATE_LOCAL_KEYS = new Set(['nello_offline_queue']);

/** Remove clinical working copies and pending account actions on identity loss. */
export function clearPrivateDraftStorage(
  storage = typeof window === 'undefined' ? null : window.sessionStorage,
  persistentStorage = typeof window === 'undefined' ? null : window.localStorage
) {
  if (storage) {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key && PRIVATE_DRAFT_PREFIXES.some((prefix) => key.startsWith(prefix))) storage.removeItem(key);
    }
  }
  if (persistentStorage) {
    for (let index = persistentStorage.length - 1; index >= 0; index -= 1) {
      const key = persistentStorage.key(index);
      if (key && (PRIVATE_LOCAL_KEYS.has(key) || PRIVATE_LOCAL_PREFIXES.some((prefix) => key.startsWith(prefix)))) {
        persistentStorage.removeItem(key);
      }
    }
  }
}
