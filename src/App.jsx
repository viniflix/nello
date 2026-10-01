import React from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { HelmetProvider, Helmet } from 'react-helmet-async';
import SmartToaster from '@/components/SmartToaster';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import AppRouter from '@/app/router';
import ClientErrorBoundary from '@/components/ClientErrorBoundary';
import PrivacyPreferences from '@/features/privacy/components/PrivacyPreferences';

const App = () => {
  return (
    <ThemeProvider defaultTheme="light">
      <HelmetProvider>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthProvider>
            <Helmet>
              <title>Nello - Consultório Nutricional Inteligente</title>
              <meta name="description" content="Plataforma moderna para nutricionistas e pacientes com controle alimentar, prescrição de dietas e acompanhamento nutricional baseado na Tabela TACO." />
            </Helmet>
            <ClientErrorBoundary>
              <AppRouter />
            </ClientErrorBoundary>
            <SmartToaster />
            <PrivacyPreferences />
          </AuthProvider>
        </Router>
      </HelmetProvider>
    </ThemeProvider>
  );
}

export default App;

