import { PostHogProvider } from '@posthog/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/app/config/queryClient';
import posthog from '@/infrastructure/analytics/posthog';

export default function ExternalProviders({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Initialization occurs only after an explicit/current consent choice. */}
      <PostHogProvider client={posthog}>
        {children}
      </PostHogProvider>
    </QueryClientProvider>
  );
}
