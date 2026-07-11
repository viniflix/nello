export function createPosthogOptions(env) {
  return {
    api_host: env.VITE_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    defaults: '2026-01-30',
  };
}

export const posthogOptions = createPosthogOptions(import.meta.env);
