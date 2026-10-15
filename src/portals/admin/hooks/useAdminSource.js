import {queryRead} from '@/lib/utils/readPolicy';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useAccessEpoch } from '@/hooks/useAccessEpoch';
import { getAccessEpoch } from '@/infrastructure/realtime/accessEpochState';
import { getPrivateSessionEpoch } from '@/lib/utils/privateSessionState';
import { useAdminAccess } from './useAdminAccess';

export function accessDenied(error) {
  return ['42501', 'PGRST301', 'PGRST302'].includes(error?.code)
    || [401, 403].includes(Number(error?.status || error?.statusCode || error?.context?.status));
}

// Identity-scoped, short-lived, non-persistent. Server reauthorizes every request.
export function useAdminSource(key, loader) {
  const { user } = useAuth();
  const client = useQueryClient();
  const access = useAdminAccess();
  const accessEpoch = useAccessEpoch(user?.id);
  const scope = useRef(accessEpoch);
  const blocked = useRef(false);
  const queryKey = ['admin-workspace', user?.id, key];
  if (scope.current !== accessEpoch) { scope.current = accessEpoch; blocked.current = true; }
  useEffect(() => {
    if (!blocked.current) return;
    void client.cancelQueries({ queryKey }).then(() => client.resetQueries({ queryKey }));
  }, [accessEpoch, client]);
  const query = useQuery({
    queryKey,
    enabled: Boolean(user?.id) && access.phase === 'authorized',
    queryFn: queryRead(async ({ signal }) => {
      const ownerEpoch = getAccessEpoch(user?.id), session = getPrivateSessionEpoch();
      const generation = access.getGeneration();
      try {
        const { data, error } = await loader({ signal });
        if (signal.aborted || ownerEpoch !== getAccessEpoch(user?.id) || session !== getPrivateSessionEpoch()
          || generation !== access.getGeneration() || !access.canAct()) {
          throw Object.assign(new Error('admin_source_obsolete'), { name: 'AbortError' });
        }
        if (error) throw error;
        if (data == null) throw new Error('admin_source_missing');
        blocked.current = false;
        return data;
      } catch (error) {
        // Preserve a valid result only on source failures. A revoked operator,
        // expired MFA or denied session must also lose the cached private data.
        if (accessDenied(error)) client.setQueryData(queryKey, null);
        throw error;
      }
    }),
    retry: false, staleTime: 60000, gcTime: 60000,
    refetchInterval: 120000, refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  return blocked.current ? { ...query, data: undefined, isPending: true } : query;
}
