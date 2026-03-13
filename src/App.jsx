import React from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import SmartToaster from '@/components/SmartToaster';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import AppLayout from '@/routes';

const App = () => {
  return (
    <ThemeProvider defaultTheme="system">
      <Router>
        <AuthProvider>
          <Helmet>
            <title>HipoZero - Controle Nutricional Inteligente</title>
            <meta name="description" content="Plataforma moderna para nutricionistas e pacientes com controle alimentar, prescrição de dietas e acompanhamento nutricional baseado na Tabela TACO." />
          </Helmet>
          <AppLayout />
          <SmartToaster />
        </AuthProvider>
      </Router>
    </ThemeProvider>
  );
}

export default App;

