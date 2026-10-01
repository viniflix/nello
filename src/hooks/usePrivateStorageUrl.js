import { useEffect, useState, useSyncExternalStore } from 'react';
import { supabase } from '@/infrastructure/supabase/client';
import { parsePrivateFile } from '@/lib/storage/privateFiles';

let sessionEpoch = 0;
let subscription;
const listeners = new Set();
const snapshot = () => sessionEpoch;
function subscribe(listener) {
  listeners.add(listener);
  if (!subscription && supabase.auth?.onAuthStateChange) {
    subscription = supabase.auth.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED') return;
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
  const [resolved, setResolved] = useState(null);
  const isStorageSource = typeof source === 'string' && (source.startsWith('storage:')
    || source.includes('/storage/v1/object/') || source.startsWith('avatars/'));
  const object = isStorageSource ? parsePrivateFile(source) : null;
  const bucket = object?.bucket;
  const path = object?.path;
  useEffect(() => {
    if (!bucket || !path) return;
    let cancelled = false;
    let objectUrl;
    const load = async () => {
      try {
        const { data, error } = await supabase.storage.from(bucket).download(path);
        if (cancelled || error || !data) return;
        objectUrl = URL.createObjectURL(data);
        setResolved({ source, epoch, url: objectUrl });
      } catch { /* Avatar fallback stays visible; never log a private path. */ }
    };
    void load();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [source, bucket, path, epoch]);
  if (object) return resolved?.source === source && resolved?.epoch === epoch ? resolved.url : undefined;
  // A malformed/foreign Storage URL must not fall through to a public fetch.
  if (source?.startsWith('storage:') || source?.includes('/storage/v1/object/')) return undefined;
  return source || undefined;
}
