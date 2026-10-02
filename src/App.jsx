import ViewportController from '@/app/ViewportController';
import RouteMetadata from '@/app/router/RouteMetadata';
import React from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import SmartToaster from '@/components/SmartToaster';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import AppRouter from '@/app/router';
import ClientErrorBoundary from '@/components/ClientErrorBoundary';
import { lazyWithReload } from '@/lib/utils/lazyWithReload';
import { ConnectivityNotice } from '@/components/ui/connectivity-notice';
const PrivacyPreferences = lazyWithReload(() => import('@/features/privacy/components/PrivacyPreferences'), 'privacy:preferences');

const App = () => {
  return (
    <ThemeProvider defaultTheme="light">
      <HelmetProvider>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthProvider>
            <ViewportController />
            <RouteMetadata />
            <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded focus:bg-background focus:p-3 focus:text-foreground">Pular para o conteúdo</a>
            <ClientErrorBoundary>
              <AppRouter />
            </ClientErrorBoundary>
            <SmartToaster />
            <React.Suspense fallback={null}><PrivacyPreferences /></React.Suspense>
            <ConnectivityNotice />
          </AuthProvider>
        </Router>
      </HelmetProvider>
    </ThemeProvider>
  );
}

export default App;

