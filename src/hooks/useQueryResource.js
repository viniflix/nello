import { useRef } from 'react';
import { queryResource } from '@/lib/utils/queryResource';
import { useAccessEpoch, resourceActor } from './useAccessEpoch';

// A denied cached result remains hidden while retrying. Only a new confirmed
// success restores it; clearing Query's error at refetch start is not permission.
export function useQueryResource(query, key, initialData = null) {
  const accessEpoch = useAccessEpoch(resourceActor(key));
  const access = useRef({ key, epoch: accessEpoch });
  const denied = useRef(null);
  if (denied.current?.key !== key) denied.current = null;
  const resource = queryResource(query, initialData);
  if (access.current.key === key && access.current.epoch !== accessEpoch) {
    denied.current = { key, error: { kind: 'access_pending', message: 'Conferindo seu acesso aos dados. Aguarde a confirmação.', retryable: true }, updatedAt: query.dataUpdatedAt };
  }
  access.current = { key, epoch: accessEpoch };
  if (['forbidden', 'unauthenticated'].includes(resource.error?.kind)) {
    denied.current = { key, error: resource.error, updatedAt: query.dataUpdatedAt };
  } else if (denied.current && query.status === 'success' && !query.isFetching && !query.error
    && query.dataUpdatedAt !== denied.current.updatedAt) {
    denied.current = null;
  }
  return denied.current ? { ...resource, data: initialData, hasSnapshot: false,
    refreshing: false, initialLoading: resource.pending, stale: false,
    confirmedAt: null, canAct: false, error: denied.current.error } : resource;
}
