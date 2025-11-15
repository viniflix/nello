import React from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import DashboardHeader from '@/components/DashboardHeader';
import { Toaster } from '@/components/ui/toaster';

const MainLayout = () => {
  const { user, signOut } = useAuth();

  if (!user || !user.profile) {
    return null;
  }

  return (
    <div className="flex min-h-screen w-full flex-col">
      {/* 1. Apenas o Header (que agora tem a navegação) */}
      <DashboardHeader
        user={user.profile}
        logout={signOut}
      />

      {/* 2. O conteúdo principal da página */}
      <main className="flex-1 p-4 md:p-6">
        <Outlet />
      </main>

      {/* 3. Toaster para notificações */}
      <Toaster />
    </div>
  );
};

export default MainLayout;
