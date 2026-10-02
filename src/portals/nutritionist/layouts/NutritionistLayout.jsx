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
    <div className="flex min-h-screen w-full flex-col overflow-x-hidden">
      <DashboardHeader
        user={user}
        logout={signOut}
      />
      <main className="flex-1 min-w-0 overflow-x-hidden">
        <ClientErrorBoundary resetKey={`${user?.id}:${location.pathname}`}><Outlet /></ClientErrorBoundary>
      </main>
    </div>
  );
};

export default NutritionistLayout;

