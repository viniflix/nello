import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export function accessDenied(error) {
  return ['42501', 'PGRST301', 'PGRST302'].includes(error?.code)
    || [401, 403].includes(Number(error?.status || error?.statusCode || error?.context?.status));
}

// Identity-scoped, short-lived, non-persistent. Server reauthorizes every request.
export function useAdminSource(key, loader) {
  const { user } = useAuth();
  const client = useQueryClient();
  const queryKey = ['admin-workspace', user?.id, key];
  return useQuery({
    queryKey,
    enabled: Boolean(user?.id),
    queryFn: async () => {
      try {
        const { data, error } = await loader();
        if (error) throw error;
        if (data == null) throw new Error('admin_source_missing');
        return data;
      } catch (error) {
        // Preserve a valid result only on source failures. A revoked operator,
        // expired MFA or denied session must also lose the cached private data.
        if (accessDenied(error)) client.setQueryData(queryKey, null);
        throw error;
      }
    },
    retry: false, staleTime: 60000, gcTime: 0,
    refetchInterval: 120000, refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}
