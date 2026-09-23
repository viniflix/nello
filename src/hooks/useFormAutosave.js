import { useCallback, useEffect, useRef, useState } from 'react';

/** Autosave for an existing draft record with a same-tab recovery copy. */
export function useFormAutosave({ storageKey, enabled, serverValue, save, delay = 800 }) {
  const [status, setStatus] = useState('idle');
  const [recovery, setRecovery] = useState(null);
  const pendingRef = useRef(null);
  const inFlightRef = useRef(null);
  const timerRef = useRef(null);
  const flushRef = useRef(null);
  const saveRef = useRef(save);
  const activeKeyRef = useRef(storageKey);
  saveRef.current = save;
  activeKeyRef.current = storageKey;

  useEffect(() => {
    clearTimeout(timerRef.current);
    pendingRef.current = null;
    setStatus('idle');
    setRecovery(null);
    if (!enabled || !storageKey) return undefined;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
      if (saved && JSON.stringify(saved.value) !== JSON.stringify(serverValue)) {
        setRecovery({ payload: saved.value, source: 'device' });
      } else if (saved) {
        sessionStorage.removeItem(storageKey);
      }
    } catch { /* A blocked storage API must not break the form. */ }
    return () => clearTimeout(timerRef.current);
  // Record changes are intentionally keyed by storageKey, not by every server update.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, enabled]);

  const flush = useCallback(async () => {
    if (!enabled || !storageKey || pendingRef.current === null) return true;
    if (inFlightRef.current) return inFlightRef.current;
    clearTimeout(timerRef.current);
    const targetKey = storageKey;
    const run = async () => {
      while (pendingRef.current !== null && activeKeyRef.current === targetKey) {
        const snapshot = pendingRef.current;
        pendingRef.current = null;
        setStatus('saving');
        try {
          await saveRef.current(snapshot);
        } catch {
          pendingRef.current = pendingRef.current ?? snapshot;
          setStatus('error');
          return false;
        }
        if (pendingRef.current === null) {
          try { sessionStorage.removeItem(targetKey); } catch { /* Ignore storage errors. */ }
          setStatus('saved');
        }
      }
      return true;
    };
    const promise = run();
    promise.then((succeeded) => {
      inFlightRef.current = null;
      if (succeeded && pendingRef.current !== null && activeKeyRef.current === targetKey) {
        timerRef.current = setTimeout(() => { void flushRef.current?.(); }, delay);
      }
    });
    inFlightRef.current = promise;
    return promise;
  }, [enabled, storageKey, delay]);
  flushRef.current = flush;

  const queue = useCallback((value) => {
    if (!enabled || !storageKey) return;
    pendingRef.current = value;
    let stored = false;
    try { sessionStorage.setItem(storageKey, JSON.stringify({ value, savedAt: Date.now() })); stored = true; } catch { /* Cloud save still runs. */ }
    setStatus(stored ? 'local' : 'error');
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void flush(); }, delay);
  }, [enabled, storageKey, delay, flush]);

  const restore = useCallback(() => {
    const value = recovery?.payload;
    if (value === undefined) return null;
    setRecovery(null);
    queue(value);
    return value;
  }, [recovery, queue]);

  const discard = useCallback(() => {
    clearTimeout(timerRef.current);
    pendingRef.current = null;
    try { if (storageKey) sessionStorage.removeItem(storageKey); } catch { /* Ignore storage errors. */ }
    setRecovery(null);
    setStatus('idle');
  }, [storageKey]);

  const discardRecovery = useCallback(() => {
    if (pendingRef.current !== null) setRecovery(null);
    else discard();
  }, [discard]);

  return { status, recovery, queue, flush, restore, discard, discardRecovery };
}
