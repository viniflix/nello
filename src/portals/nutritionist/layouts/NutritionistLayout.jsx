import ClientErrorBoundary from '@/components/ClientErrorBoundary';
import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import DashboardHeader from '@/components/DashboardHeader';

const NutritionistLayout = () => {
  const location = useLocation();
  const { user, signOut } = useAuth();

  if (!user || !user?.profile) {
    return null;
  }

  return (
    <div className="flex min-h-dvh w-full flex-col min-w-0">
      <DashboardHeader
        user={user}
        logout={signOut}
      />
      <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 min-w-0">
        <ClientErrorBoundary resetKey={`${user?.id}:${location.pathname}`}><Outlet /></ClientErrorBoundary>
      </main>
    </div>
  );
};

export default NutritionistLayout;

