import ClientErrorBoundary from '@/components/ClientErrorBoundary';
import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import DashboardHeader from '@/components/DashboardHeader';
import PortalBreadcrumbs from '@/components/navigation/PortalBreadcrumbs';

const NutritionistLayout = () => {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const isChatPage = location.pathname === '/nutritionist/chat' || location.pathname.startsWith('/nutritionist/chat/');

  if (!user || !user?.profile) {
    return null;
  }

  return (
    <div className={`flex min-h-dvh w-full flex-col min-w-0 ${isChatPage ? 'h-dvh overflow-hidden' : ''}`}>
      <DashboardHeader
        user={user}
        logout={signOut}
      />
      <main id="main-content" tabIndex={-1} className={`flex-1 min-w-0 ${isChatPage ? 'flex min-h-0 flex-col' : ''}`}>
        <PortalBreadcrumbs />
        <div className={isChatPage ? 'min-h-0 flex-1' : undefined}><ClientErrorBoundary resetKey={`${user?.id}:${location.pathname}`}><Outlet /></ClientErrorBoundary></div>
      </main>
    </div>
  );
};

export default NutritionistLayout;

