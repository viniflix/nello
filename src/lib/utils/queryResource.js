import { failurePresentation } from './failure';

// TanStack already preserves successful data on refetch errors. Present it safely.
export function queryResource(query, initialData = null) {
  const error = query.error ? failurePresentation(query.error) : null;
  const denied = ['forbidden', 'unauthenticated'].includes(error?.kind);
  const hasSnapshot = !denied && query.data !== undefined;
  const pending = Boolean(query.isFetching || query.fetchStatus === 'paused');
  return { data: denied ? initialData : query.data ?? initialData, hasSnapshot,
    pending, initialLoading: !hasSnapshot && Boolean(query.isLoading || pending),
    refreshing: hasSnapshot && pending, error, stale: hasSnapshot && Boolean(error),
    confirmedAt: hasSnapshot ? query.dataUpdatedAt || null : null,
    canAct: hasSnapshot && !pending && !error };
}
