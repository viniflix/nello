import {isSessionIndependentPath,normalizeRoutePath} from './publicRoutePolicy';
import React, { Suspense } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { PageLoadingFallback } from './routeGuards';
import { authRoutes } from './authRoutes';
import { lazyWithReload } from '@/lib/utils/lazyWithReload';
const StatusPage = lazyWithReload(() => import('@/pages/public/StatusPage'), 'public:status');
const PrivateAppRouter = lazyWithReload(() => import('./PrivateAppRouter.jsx'), 'private:router');
const LandingPage = lazyWithReload(() => import('@/pages/public/LandingPage'), 'public:landing');
const LegalInformationPage = lazyWithReload(() => import('@/pages/public/LegalInformationPage'), 'public:legal-information');
const ProductInformationPage = lazyWithReload(() => import('@/pages/public/ProductInformationPage'), 'public:product-information');
const ResearchPage = lazyWithReload(() => import('@/pages/public/ResearchPage'), 'public:research');

// Rota Omnichannel Public Facing (Sem Auth Block)
const PatientFacingAnamnesis = lazyWithReload(() => import('@/pages/public/anamnesis/PatientFacingUi.jsx'), 'public:anamnesis');
const DocumentAuthenticityPage = lazyWithReload(() => import('@/pages/public/DocumentAuthenticityPage.jsx'), 'public:document-authenticity');

const AppRouter = () => {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();

  // Operational status must remain readable while authentication is unavailable.
  const publicPath=normalizeRoutePath(pathname);
  if(publicPath==='/status')return <Suspense fallback={<PageLoadingFallback />}><StatusPage /></Suspense>;
  if (publicPath === '/pesquisa') return <Suspense fallback={<PageLoadingFallback />}><ResearchPage /></Suspense>;
  if (['/recursos', '/para-pacientes'].includes(publicPath)) return <Suspense fallback={<PageLoadingFallback />}><ProductInformationPage pathname={publicPath} /></Suspense>;
  if (['/termos', '/privacidade', '/ajuda', '/seguranca'].includes(publicPath)) return <Suspense fallback={<PageLoadingFallback />}><LegalInformationPage pathname={publicPath} /></Suspense>;

  if (pathname === '/' && !user) return <Suspense fallback={<PageLoadingFallback />}><LandingPage /></Suspense>;

  if(isSessionIndependentPath(pathname)&&publicPath!=='/')return <Suspense fallback={<PageLoadingFallback/>}><Routes>
    {authRoutes}
    <Route path="/f/:token" element={<PatientFacingAnamnesis key={pathname}/>}/>
    <Route path="/verificar-documento/:code?" element={<DocumentAuthenticityPage/>}/>
  </Routes></Suspense>;

  if (loading) {
    return <PageLoadingFallback />;
  }

  return <Suspense fallback={<PageLoadingFallback />}><PrivateAppRouter /></Suspense>;
};

export default AppRouter;

