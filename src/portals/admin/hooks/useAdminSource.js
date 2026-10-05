import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';

// Identity-scoped, short-lived, non-persistent. Server reauthorizes every request.
export function useAdminSource(key, loader) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['admin-workspace', user?.id, key],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await loader();
      if (error) throw error;
      if (data == null) throw new Error('admin_source_missing');
      return data;
    },
    retry: false, staleTime: 60000, gcTime: 0,
    refetchInterval: 120000, refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}
