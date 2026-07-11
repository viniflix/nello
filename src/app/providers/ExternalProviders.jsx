import { PostHogProvider } from '@posthog/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/app/config/queryClient';
import { posthogOptions } from '@/app/config/posthog';

export default function ExternalProviders({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <PostHogProvider
        apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
        options={posthogOptions}
      >
        {children}
      </PostHogProvider>
    </QueryClientProvider>
  );
}
