import React, { Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ChatProvider } from '@/contexts/ChatContext';
import { RealtimeProvider } from '@/contexts/RealtimeContext';
import { NotificationsCacheOwner } from '@/hooks/useNotificationsData';
import { authRoutes } from './authRoutes';
import { nutritionistRoutes } from './nutritionistRoutes';
import { patientRoutes } from './patientRoutes';
import { adminRoutes } from './adminRoutes';
import { PageLoadingFallback } from './routeGuards';
import { getHomePath } from './homePath';
import NotFoundPage from '@/pages/public/NotFoundPage';
import { lazyWithReload } from '@/lib/utils/lazyWithReload';
const PatientFacingAnamnesis = lazyWithReload(() => import('@/pages/public/anamnesis/PatientFacingUi.jsx'), 'public:anamnesis');
const DocumentAuthenticityPage = lazyWithReload(() => import('@/pages/public/DocumentAuthenticityPage.jsx'), 'public:document-authenticity');

export default function PrivateAppRouter() {
  const { user } = useAuth();
  const { pathname } = useLocation();
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
              <Route path="/f/:token" element={<PatientFacingAnamnesis key={pathname} />} />
              <Route path="/verificar-documento/:code?" element={<DocumentAuthenticityPage />} />

              {/* Rotas de redirecionamento */}
              <Route path="/" element={<Navigate to={getHomePath(user)} replace />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </div>
    </ChatProvider></NotificationsCacheOwner></RealtimeProvider>
  );
}
