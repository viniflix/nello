import React from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AdminHeader from '@/components/admin/AdminHeader';

const AdminLayout = () => {
  const { user } = useAuth();

  if (!user || !user.profile) return null;
  if (user.profile.is_admin !== true) return null;

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <AdminHeader />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto w-full px-4 md:px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
