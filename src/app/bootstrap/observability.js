import {
  browserTracingIntegration,
  init,
  replayIntegration,
} from '@sentry/react';

export function initializeObservability(env) {
  init({
    dsn: env.VITE_SENTRY_DSN || 'https://acadabf7addba866fe7468c13ba80e93@o4511147428478976.ingest.us.sentry.io/4511147439685632',
    sendDefaultPii: true,
    integrations: [
      browserTracingIntegration(),
      replayIntegration(),
    ],
    tracesSampleRate: 1.0,
    tracePropagationTargets: ['localhost', /^https:\/\/yourserver\.io\/api/],
    replaysSessionSampleRate: 0.0,
    replaysOnErrorSampleRate: 1.0,
  });
}
