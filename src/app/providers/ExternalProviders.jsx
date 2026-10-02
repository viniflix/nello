import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/app/config/queryClient';

export default function ExternalProviders({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
