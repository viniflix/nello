import React, { Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ChatProvider } from '@/contexts/ChatContext';
import { PageLoadingFallback } from './routeGuards';
import { authRoutes } from './authRoutes';
import { nutritionistRoutes } from './nutritionistRoutes';
import { patientRoutes } from './patientRoutes';
import { adminRoutes } from './adminRoutes';
import { RealtimeProvider } from '@/contexts/RealtimeContext';
import { NotificationsCacheOwner } from '@/hooks/useNotificationsData';
import { getHomePath } from './homePath';
import { lazyWithReload } from '@/lib/utils/lazyWithReload';
import StatusPage from '@/pages/public/StatusPage';
import NotFoundPage from '@/pages/public/NotFoundPage';
const LandingPage = lazyWithReload(() => import('@/pages/public/LandingPage'), 'public:landing');
const LegalInformationPage = lazyWithReload(() => import('@/pages/public/LegalInformationPage'), 'public:legal-information');
const ProductInformationPage = lazyWithReload(() => import('@/pages/public/ProductInformationPage'), 'public:product-information');

// Rota Omnichannel Public Facing (Sem Auth Block)
const PatientFacingAnamnesis = lazyWithReload(() => import('@/pages/public/anamnesis/PatientFacingUi.jsx'), 'public:anamnesis');
const DocumentAuthenticityPage = lazyWithReload(() => import('@/pages/public/DocumentAuthenticityPage.jsx'), 'public:document-authenticity');

const AppRouter = () => {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();

  // Operational status must remain readable while authentication is unavailable.
  if (pathname === '/status' || pathname === '/status/') return <StatusPage />;
  const publicPath = pathname.replace(/\/$/, '');
  if (['/recursos', '/para-pacientes'].includes(publicPath)) return <Suspense fallback={<PageLoadingFallback />}><ProductInformationPage pathname={publicPath} /></Suspense>;
  if (['/termos', '/privacidade', '/ajuda', '/seguranca'].includes(publicPath)) return <Suspense fallback={<PageLoadingFallback />}><LegalInformationPage pathname={publicPath} /></Suspense>;

  if (pathname === '/' && !user) return <Suspense fallback={<PageLoadingFallback />}><LandingPage /></Suspense>;

  if (loading) {
    return <PageLoadingFallback />;
  }

  return (
    <RealtimeProvider><NotificationsCacheOwner><ChatProvider>
        <div className="min-h-dvh bg-background">
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
    </ChatProvider></NotificationsCacheOwner></RealtimeProvider>
  );
};

export default AppRouter;

