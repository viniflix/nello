export function createPosthogOptions(env) {
  return {
    api_host: env.VITE_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    defaults: '2026-01-30',
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
  };
}

export const posthogOptions = createPosthogOptions(import.meta.env);
