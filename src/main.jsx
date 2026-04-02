import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import '@/index.css';
import { PostHogProvider } from '@posthog/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Sentry from "@sentry/react";

Sentry.init({
  // Chave oficial do seu projeto:
  dsn: import.meta.env.VITE_SENTRY_DSN || "https://acadabf7addba866fe7468c13ba80e93@o4511147428478976.ingest.us.sentry.io/4511147439685632",
  sendDefaultPii: true, // Capturar IP e User-Agent pra facilitar a investigação
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 1.0, 
  tracePropagationTargets: ["localhost", /^https:\/\/yourserver\.io\/api/],
  
  // Como discutido: PostHog faz o trabalho diário, Sentry grava VÍDEO APENAS dos BUGS.
  replaysSessionSampleRate: 0.0, 
  replaysOnErrorSampleRate: 1.0, 
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutos de cache
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const posthogOptions = {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
  defaults: '2026-01-30',
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <PostHogProvider
        apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
        options={posthogOptions}
      >
        <App />
      </PostHogProvider>
    </QueryClientProvider>
  </React.StrictMode>
);