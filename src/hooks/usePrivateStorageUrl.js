import {executeRead,readPolicies} from '@/lib/utils/readPolicy';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { supabase } from '@/infrastructure/supabase/client';
import { parsePrivateFile } from '@/lib/storage/privateFiles';
import { useAccessEpoch } from './useAccessEpoch';
import { getAccessEpoch } from '@/infrastructure/realtime/accessEpochState';
import { getPrivateSessionEpoch, getPrivateSessionOwner } from '@/lib/utils/privateSessionState';

let sessionEpoch = 0;
let sessionActor = null;
let subscription;
const listeners = new Set();
const snapshot = () => sessionEpoch;
function subscribe(listener) {
  listeners.add(listener);
  if (!subscription && supabase.auth?.onAuthStateChange) {
    sessionActor = getPrivateSessionOwner();
    subscription = supabase.auth.onAuthStateChange((event, session) => {
      const nextActor = session?.user?.id || null;
      if (event === 'TOKEN_REFRESHED' && (!nextActor || nextActor === sessionActor)) return;
      if (nextActor && nextActor === sessionActor && event !== 'SIGNED_OUT') return;
      sessionActor = nextActor;
      sessionEpoch += 1;
      for (const notify of listeners) notify();
    }).data.subscription;
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { subscription?.unsubscribe(); subscription = undefined; }
  };
}

// Authenticated downloads evaluate RLS on every request. Object URLs remain
// local to the current view and are revoked on source/session change/unmount.
export function usePrivateStorageUrl(source) {
  const epoch = useSyncExternalStore(subscribe, snapshot, snapshot);
  const actor = getPrivateSessionOwner(), access = useAccessEpoch(actor);
  const privateEpoch = getPrivateSessionEpoch();
  const [resolved, setResolved] = useState(null);
  const isStorageSource = typeof source === 'string' && (source.startsWith('storage:')
    || source.includes('/storage/v1/object/') || source.startsWith('avatars/'));
  const object = isStorageSource ? parsePrivateFile(source) : null;
  const bucket = object?.bucket;
  const path = object?.path;
  useEffect(() => {
    if (!bucket || !path) return;
    let cancelled = false;
    const controller = new AbortController();
    let objectUrl;
    const load = async () => {
      try {
        const { data, error } = await executeRead(signal => supabase.storage.from(bucket).download(path, {}, {signal}), {signal:controller.signal,policy:readPolicies.asset});
        if (cancelled || access !== getAccessEpoch(actor) || privateEpoch !== getPrivateSessionEpoch() || error || !data) return;
        objectUrl = URL.createObjectURL(data);
        setResolved({ source, epoch, access, privateEpoch, url: objectUrl });
      } catch { /* Avatar fallback stays visible; never log a private path. */ }
    };
    void load();
    return () => { cancelled = true; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [source, bucket, path, epoch, actor, access, privateEpoch]);
  if (object) return resolved?.source === source && resolved?.epoch === epoch && resolved?.access === access && resolved?.privateEpoch === privateEpoch ? resolved.url : undefined;
  // A malformed/foreign Storage URL must not fall through to a public fetch.
  if (source?.startsWith('storage:') || source?.includes('/storage/v1/object/')) return undefined;
  return source || undefined;
}
