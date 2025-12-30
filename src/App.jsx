import React from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import SmartToaster from '@/components/SmartToaster';
import { AuthProvider } from '@/contexts/AuthContext';
import { AdminModeProvider } from '@/contexts/AdminModeContext';
import AppLayout from '@/routes';

const App = () => {
  return (
    <Router>
      <AuthProvider>
        <AdminModeProvider>
          <Helmet>
            <title>HipoZero - Controle Nutricional Inteligente</title>
            <meta name="description" content="Plataforma moderna para nutricionistas e pacientes com controle alimentar, prescrição de dietas e acompanhamento nutricional baseado na Tabela TACO." />
          </Helmet>
          <AppLayout />
          {/* Smart Toaster with dynamic positioning based on admin state */}
          <SmartToaster />
        </AdminModeProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
