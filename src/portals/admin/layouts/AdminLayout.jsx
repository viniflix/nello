import ClientErrorBoundary from '@/components/ClientErrorBoundary';
import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AdminHeader from '@/components/admin/AdminHeader';

const AdminLayout = () => {
  const location = useLocation();
  const { user } = useAuth();

  if (!user || !user?.profile) return null;

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <AdminHeader />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto w-full px-4 md:px-8 py-8">
          <ClientErrorBoundary resetKey={`${user?.id}:${location.pathname}`}><Outlet /></ClientErrorBoundary>
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
