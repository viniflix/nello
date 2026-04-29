import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ChatProvider } from '@/contexts/ChatContext';
import { PageLoadingFallback } from './routeGuards';
import { authRoutes } from './authRoutes';
import { nutritionistRoutes } from './nutritionistRoutes';
import { patientRoutes } from './patientRoutes';
import { adminRoutes } from './adminRoutes';
import PresenceGlobal from '@/components/PresenceGlobal';

// Rota Omnichannel Public Facing (Sem Auth Block)
const PatientFacingAnamnesis = React.lazy(() => import('@/pages/public/anamnesis/PatientFacingUi.jsx'));

const AppLayout = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return <PageLoadingFallback />;
  }

  const getHomePath = () => {
    if (!user || !user?.profile) return "/login";
    return user?.profile?.user_type === 'nutritionist' ? '/nutritionist' : '/patient';
  };

  return (
    <ChatProvider>
        <PresenceGlobal />
        <div className="min-h-screen bg-background">
          <Suspense fallback={<PageLoadingFallback />}>
            <Routes>
              {authRoutes}
              {nutritionistRoutes}
              {patientRoutes}
              {adminRoutes}
              
              {/* Rota Externa Segura: Formulários Omnichannel Mobile-First */}
              <Route path="/f/:token" element={<PatientFacingAnamnesis />} />
              
              {/* Rotas de redirecionamento */}
              <Route path="/" element={<Navigate to={getHomePath()} replace />} />
              {/* Removido o catch-all Navigate para evitar redirecionamento indevido no F5 */}
            </Routes>
          </Suspense>
        </div>
    </ChatProvider>
  );
};

export default AppLayout;

