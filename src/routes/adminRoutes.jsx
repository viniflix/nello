import React, { lazy } from 'react';
import { Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './routeGuards';
import AdminLayout from '@/components/admin/AdminLayout.jsx';

// Lazy load das páginas admin
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard.jsx'));
const AdminUsersPage = lazy(() => import('@/pages/admin/AdminUsersPage.jsx'));
const AdminFinancialPage = lazy(() => import('@/pages/admin/AdminFinancialPage.jsx'));
const AdminNutritionistDetailPage = lazy(() => import('@/pages/admin/AdminNutritionistDetailPage.jsx'));
const AdminStudyPage = lazy(() => import('@/pages/admin/AdminStudyPage.jsx'));

export const adminRoutes = (
    <>
        <Route 
            path="/admin" 
            element={<Navigate to="/admin/dashboard" replace />} 
        />
        <Route 
            element={
                <ProtectedRoute requireAdmin={true}>
                    <AdminLayout />
                </ProtectedRoute>
            }
        >
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/admin/users/:id" element={<AdminNutritionistDetailPage />} />
            <Route path="/admin/financial" element={<AdminFinancialPage />} />
            <Route path="/admin/study" element={<AdminStudyPage />} />
        </Route>
    </>
);
