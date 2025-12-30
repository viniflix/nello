import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ChatProvider } from '@/contexts/ChatContext';
import { PageLoadingFallback } from './routeGuards';
import { authRoutes } from './authRoutes';
import { nutritionistRoutes } from './nutritionistRoutes';
import { patientRoutes } from './patientRoutes';
import { adminRoutes } from './adminRoutes';

const AppLayout = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return <PageLoadingFallback />;
  }

  const getHomePath = () => {
    if (!user) return "/login";
    return user.profile.user_type === 'nutritionist' ? '/nutritionist' : '/patient';
  };

  return (
    <ChatProvider>
        <div className="min-h-screen bg-background">
          <Suspense fallback={<PageLoadingFallback />}>
            <Routes>
              {authRoutes}
              {nutritionistRoutes}
              {patientRoutes}
              {adminRoutes}
              
              {/* Rotas de redirecionamento */}
              <Route path="/" element={<Navigate to={getHomePath()} replace />} />
              <Route path="*" element={<Navigate to={getHomePath()} replace />} />
            </Routes>
          </Suspense>
        </div>
    </ChatProvider>
  );
};

export default AppLayout;

