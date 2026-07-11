import { describe, expect, it } from 'vitest';
import { queryClient, queryClientOptions } from './queryClient';
import { createPosthogOptions } from './posthog';

describe('application runtime configuration', () => {
  it('preserves the query defaults used by the application', () => {
    expect(queryClientOptions).toEqual({
      defaultOptions: {
        queries: {
          staleTime: 1000 * 60 * 5,
          retry: 1,
          refetchOnWindowFocus: false,
        },
      },
    });
    expect(queryClient.getDefaultOptions()).toEqual(queryClientOptions.defaultOptions);
  });

  it('uses the configured PostHog host', () => {
    expect(createPosthogOptions({ VITE_PUBLIC_POSTHOG_HOST: 'https://analytics.example.com' })).toEqual({
      api_host: 'https://analytics.example.com',
      defaults: '2026-01-30',
    });
  });

  it('falls back to the current PostHog host', () => {
    expect(createPosthogOptions({})).toEqual({
      api_host: 'https://us.i.posthog.com',
      defaults: '2026-01-30',
    });
  });
});
