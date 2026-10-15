import { useCallback, useSyncExternalStore } from 'react';
import { getAccessEpoch, subscribeAccessEpoch } from '@/infrastructure/realtime/accessEpochState';
export function useAccessEpoch(actor) {
  const subscribe = useCallback(callback => subscribeAccessEpoch(actor, callback), [actor]);
  const snapshot = useCallback(() => getAccessEpoch(actor), [actor]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
export function resourceActor(key) {
  try { const parsed = JSON.parse(key); return Array.isArray(parsed) && typeof parsed[0] === 'string' ? parsed[0] : null; }
  catch { return null; }
}
