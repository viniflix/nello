import { queryReadRetry } from '@/lib/utils/readPolicy';
import { QueryClient } from '@tanstack/react-query';

export const queryClientOptions = {
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: queryReadRetry,
      refetchOnWindowFocus: false,
    },
  },
};

export const queryClient = new QueryClient(queryClientOptions);
