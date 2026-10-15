import { useCallback, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/app/config/queryClient';
import { useAccessEpoch } from './useAccessEpoch';
import { referenceOptions, referenceScope } from '@/lib/utils/referenceCache';
import { classifyFailure } from '@/lib/utils/failure';

const EMPTY = [];
export function useReferenceResource(name, owner, id, load, enabled = true) {
  useAccessEpoch(owner);
  const options = referenceOptions(name, owner, id, load, referenceScope(owner));
  const query = useQuery({ ...options, enabled }, queryClient);
  const key = JSON.stringify(options.queryKey);
  const queryKey = useMemo(() => JSON.parse(key), [key]);
  const refetchQuery = query.refetch;
  const blocked = useRef(null);
  if (blocked.current?.key !== key) blocked.current = null;
  if (['unauthenticated', 'forbidden'].includes(classifyFailure(query.error))) {
    blocked.current = {key, error:query.error, updatedAt:query.dataUpdatedAt};
  } else if (blocked.current && query.isSuccess && !query.isFetching && !query.error
    && query.dataUpdatedAt !== blocked.current.updatedAt) blocked.current = null;
  const refetch = useCallback(async () => {
    await queryClient.cancelQueries({ queryKey, exact: true });
    return refetchQuery();
  }, [refetchQuery, queryKey]);
  return {
    data: enabled && !blocked.current ? query.data ?? EMPTY : EMPTY,
    isLoading: enabled && query.isPending,
    isRefreshing: enabled && query.isFetching && !query.isPending,
    error: enabled ? blocked.current?.error || query.error : null, refetch, scope:key,
  };
}
