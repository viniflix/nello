import React from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import DashboardHeader from '@/components/DashboardHeader';

const MainLayout = () => {
  const { user, signOut } = useAuth();

  if (!user || !user.profile) { 
    return null; 
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader 
        user={user.profile}
        logout={signOut}
        onToggleNotifications={() => setShowNotifications(s => !s)}
      />
      
      <main>
        <Outlet />
      </main>
    </div>
  );
};

export default MainLayout;