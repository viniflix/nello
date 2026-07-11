import React, { lazy, Suspense } from 'react';
import { Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './routeGuards';
import AdminLayout from '@/components/admin/AdminLayout.jsx';

const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard.jsx'));
const AdminBugReportsPage = lazy(() => import('@/pages/admin/AdminBugReportsPage.jsx'));
const AdminUsersPage = lazy(() => import('@/pages/admin/AdminUsersPage.jsx'));
const AdminFinancialPage = lazy(() => import('@/pages/admin/AdminFinancialPage.jsx'));
const AdminNutritionistDetailPage = lazy(() => import('@/pages/admin/AdminNutritionistDetailPage.jsx'));
const AdminStudyPage = lazy(() => import('@/pages/admin/AdminStudyPage.jsx'));

function LoadingFallback() {
  return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
}

export const adminRoutes = (
  <>
    <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
    <Route element={<ProtectedRoute requireAdmin={true}><AdminLayout /></ProtectedRoute>}>
      <Route path="/admin/dashboard" element={<Suspense fallback={<LoadingFallback />}><AdminDashboard /></Suspense>} />
      <Route path="/admin/bugs" element={<Suspense fallback={<LoadingFallback />}><AdminBugReportsPage /></Suspense>} />
      <Route path="/admin/users" element={<Suspense fallback={<LoadingFallback />}><AdminUsersPage /></Suspense>} />
      <Route path="/admin/users/:id" element={<Suspense fallback={<LoadingFallback />}><AdminNutritionistDetailPage /></Suspense>} />
      <Route path="/admin/financial" element={<Suspense fallback={<LoadingFallback />}><AdminFinancialPage /></Suspense>} />
      <Route path="/admin/study" element={<Suspense fallback={<LoadingFallback />}><AdminStudyPage /></Suspense>} />
    </Route>
  </>
);
