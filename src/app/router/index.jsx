import React, { Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ChatProvider } from '@/contexts/ChatContext';
import { PageLoadingFallback } from './routeGuards';
import { authRoutes } from './authRoutes';
import { nutritionistRoutes } from './nutritionistRoutes';
import { patientRoutes } from './patientRoutes';
import { adminRoutes } from './adminRoutes';
import PresenceGlobal from '@/components/PresenceGlobal';
import { getHomePath } from './homePath';
import { lazyWithReload } from '@/lib/utils/lazyWithReload';
import StatusPage from '@/pages/public/StatusPage';
import NotFoundPage from '@/pages/public/NotFoundPage';

// Rota Omnichannel Public Facing (Sem Auth Block)
const PatientFacingAnamnesis = lazyWithReload(() => import('@/pages/public/anamnesis/PatientFacingUi.jsx'), 'public:anamnesis');
const DocumentAuthenticityPage = lazyWithReload(() => import('@/pages/public/DocumentAuthenticityPage.jsx'), 'public:document-authenticity');

const AppRouter = () => {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();

  // Operational status must remain readable while authentication is unavailable.
  if (pathname === '/status' || pathname === '/status/') return <StatusPage />;

  if (loading) {
    return <PageLoadingFallback />;
  }

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
              <Route path="/verificar-documento/:code?" element={<DocumentAuthenticityPage />} />
              
              {/* Rotas de redirecionamento */}
              <Route path="/" element={<Navigate to={getHomePath(user)} replace />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </div>
    </ChatProvider>
  );
};

export default AppRouter;

