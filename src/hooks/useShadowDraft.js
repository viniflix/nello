import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

const WAIT_MS = 450;
const LOCAL_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const localKeyFor = (ownerId, draftKey) => `nello_shadow:${ownerId}:${draftKey}`;

function readLocal(key) {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (!value || Date.now() - value.savedAt > LOCAL_MAX_AGE_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

/** A private, versioned working copy. The caller decides when to publish it. */
export function useShadowDraft({ ownerId, draftKey, enabled = true }) {
  const [status, setStatus] = useState('loading');
  const [recovery, setRecovery] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [ready, setReady] = useState(false);
  const revisionRef = useRef(null);
  const remoteRef = useRef(null);
  const latestRef = useRef(null);
  const timerRef = useRef(null);
  const inFlightRef = useRef(null);
  const generationRef = useRef(0);
  const loadedRef = useRef(false);
  const blockedRef = useRef(false);
  const flushRef = useRef(null);
  const localKey = ownerId && draftKey ? localKeyFor(ownerId, draftKey) : null;

  useEffect(() => {
    const generation = ++generationRef.current;
    clearTimeout(timerRef.current);
    latestRef.current = null;
    revisionRef.current = null;
    remoteRef.current = null;
    loadedRef.current = false;
    blockedRef.current = false;
    setRecovery(null);
    setReady(false);
    setStatus('loading');
    if (!enabled || !ownerId || !draftKey) {
      setStatus('idle');
      return undefined;
    }

    const load = async () => {
      const local = readLocal(localKey);
      let data;
      let error;
      try {
        ({ data, error } = await supabase
          .from('editor_shadow_drafts')
          .select('payload, revision, updated_at')
          .eq('owner_id', ownerId)
          .eq('draft_key', draftKey)
          .maybeSingle());
      } catch (caught) {
        error = caught;
      }
      if (generationRef.current !== generation) return;
      if (error) {
        // The local copy remains available if the network is down.
        if (local) {
          blockedRef.current = true;
          setRecovery({ payload: local.payload, source: 'device' });
        }
        setStatus('error');
      } else {
        loadedRef.current = true;
        revisionRef.current = data?.revision ?? null;
        remoteRef.current = data || null;
        const localDiffers = local && JSON.stringify(local.payload) !== JSON.stringify(data?.payload);
        if (localDiffers && local.revision !== (data?.revision ?? null)) {
          blockedRef.current = true;
          setRecovery({ payload: local.payload, source: 'device', conflict: true });
          setStatus('conflict');
        } else if (localDiffers) {
          blockedRef.current = true;
          setRecovery({ payload: local.payload, source: 'device' });
          setStatus('recoverable');
        } else if (data?.payload) {
          if (localKey) {
            try { sessionStorage.removeItem(localKey); } catch { /* Cloud copy is current. */ }
          }
          blockedRef.current = true;
          setRecovery({ payload: data.payload, source: 'cloud' });
          setLastSavedAt(data.updated_at);
          setStatus('recoverable');
        } else {
          setStatus('idle');
        }
        if (latestRef.current && !blockedRef.current) void flushRef.current?.();
      }
      setReady(true);
    };
    void load();
    return () => {
      clearTimeout(timerRef.current);
      generationRef.current += 1;
    };
  }, [ownerId, draftKey, enabled, localKey]);

  const flush = useCallback(async () => {
    if (!enabled || !ownerId || !draftKey || !latestRef.current) return false;
    if (blockedRef.current) return false;
    if (!loadedRef.current) {
      let data;
      let error;
      try {
        ({ data, error } = await supabase.from('editor_shadow_drafts')
          .select('payload, revision, updated_at').eq('owner_id', ownerId).eq('draft_key', draftKey).maybeSingle());
      } catch (caught) {
        error = caught;
      }
      if (error) { setStatus('error'); return false; }
      const local = readLocal(localKey);
      if (local?.revision !== (data?.revision ?? null)) {
        blockedRef.current = true;
        remoteRef.current = data || null;
        revisionRef.current = data?.revision ?? null;
        setRecovery({ payload: local?.payload || latestRef.current, source: 'device', conflict: true });
        setStatus('conflict');
        return false;
      }
      revisionRef.current = data?.revision ?? null;
      remoteRef.current = data || null;
      loadedRef.current = true;
    }
    if (inFlightRef.current) return inFlightRef.current;
    const generation = generationRef.current;
    const run = async () => {
      while (latestRef.current && generationRef.current === generation) {
        const snapshot = latestRef.current;
        latestRef.current = null;
        setStatus('saving');
        let data;
        let error;
        try {
          if (revisionRef.current === null) {
            ({ data, error } = await supabase.from('editor_shadow_drafts')
              .insert({ owner_id: ownerId, draft_key: draftKey, payload: snapshot })
              .select('revision, updated_at').single());
          } else {
            ({ data, error } = await supabase.from('editor_shadow_drafts')
              .update({ payload: snapshot })
              .eq('owner_id', ownerId).eq('draft_key', draftKey).eq('revision', revisionRef.current)
              .select('revision, updated_at').maybeSingle());
          }
        } catch (caught) {
          error = caught;
        }
        if (generationRef.current !== generation) return false;
        if (error || !data) {
          latestRef.current = latestRef.current || snapshot;
          const conflict = error?.code === '23505' || !data;
          blockedRef.current = conflict;
          if (conflict) {
            try {
              const { data: remote } = await supabase.from('editor_shadow_drafts')
                .select('payload, revision, updated_at')
                .eq('owner_id', ownerId).eq('draft_key', draftKey).maybeSingle();
              if (remote) {
                remoteRef.current = remote;
                revisionRef.current = remote.revision;
              }
            } catch { /* Local working copy remains recoverable. */ }
            setRecovery({ payload: latestRef.current, source: 'device', conflict: true });
          }
          setStatus(conflict ? 'conflict' : 'error');
          return false;
        }
        revisionRef.current = data.revision;
        remoteRef.current = { payload: snapshot, revision: data.revision, updated_at: data.updated_at };
        setLastSavedAt(data.updated_at);
        if (latestRef.current) {
          try {
            sessionStorage.setItem(localKey, JSON.stringify({ payload: latestRef.current, savedAt: Date.now(), revision: data.revision }));
          } catch { /* Cloud is the authoritative copy. */ }
        } else {
          try { sessionStorage.removeItem(localKey); } catch { /* Cloud save succeeded. */ }
          setStatus('saved');
        }
      }
      return true;
    };
    const promise = run();
    promise.then((succeeded) => {
      inFlightRef.current = null;
      if (succeeded && latestRef.current && !blockedRef.current && generationRef.current === generation) {
        timerRef.current = setTimeout(() => { void flushRef.current?.(); }, WAIT_MS);
      }
    });
    inFlightRef.current = promise;
    return promise;
  }, [enabled, ownerId, draftKey, localKey]);
  flushRef.current = flush;

  const queue = useCallback((payload) => {
    if (!enabled || !ownerId || !draftKey) return;
    latestRef.current = payload;
    let stored = false;
    try {
      sessionStorage.setItem(localKey, JSON.stringify({ payload, savedAt: Date.now(), revision: revisionRef.current }));
      stored = true;
    } catch { /* The status remains unsaved until the cloud confirms. */ }
    setStatus(blockedRef.current ? 'conflict' : stored ? 'local' : 'error');
    clearTimeout(timerRef.current);
    if (!blockedRef.current) timerRef.current = setTimeout(() => { void flush(); }, WAIT_MS);
  }, [enabled, ownerId, draftKey, localKey, flush]);

  const discard = useCallback(async () => {
    clearTimeout(timerRef.current);
    if (inFlightRef.current) await inFlightRef.current;
    if (!ownerId || !draftKey) return false;
    if (revisionRef.current !== null) {
      let data;
      let error;
      try {
        ({ data, error } = await supabase.from('editor_shadow_drafts')
          .delete().eq('owner_id', ownerId).eq('draft_key', draftKey)
          .eq('revision', revisionRef.current).select('id').maybeSingle());
      } catch (caught) {
        error = caught;
      }
      if (error) { setStatus('error'); return false; }
      if (!data) {
        setStatus('conflict');
        return false;
      }
    }
    latestRef.current = null;
    if (localKey) {
      try { sessionStorage.removeItem(localKey); } catch { /* Server copy was removed. */ }
    }
    revisionRef.current = null;
    remoteRef.current = null;
    blockedRef.current = false;
    setRecovery(null);
    setStatus('idle');
    return true;
  }, [ownerId, draftKey, localKey]);

  const restore = useCallback(() => {
    if (!recovery) return null;
    const value = recovery.payload;
    setRecovery(null);
    blockedRef.current = false;
    if (recovery.source === 'device') queue(value);
    return value;
  }, [recovery, queue]);

  const discardRecovery = useCallback(async () => {
    if (recovery?.source === 'device') {
      clearTimeout(timerRef.current);
      latestRef.current = null;
      try { if (localKey) sessionStorage.removeItem(localKey); } catch { /* Ignore storage errors. */ }
      if (remoteRef.current) {
        revisionRef.current = remoteRef.current.revision;
        setRecovery({ payload: remoteRef.current.payload, source: 'cloud' });
        setStatus('recoverable');
      } else {
        blockedRef.current = false;
        setRecovery(null);
        setStatus('idle');
      }
      return true;
    }
    const currentWork = latestRef.current;
    const removed = await discard();
    if (removed && currentWork) queue(currentWork);
    return removed;
  }, [discard, queue, recovery, localKey]);

  return { status, recovery, lastSavedAt, ready, queue, flush, discard, discardRecovery, restore };
}
