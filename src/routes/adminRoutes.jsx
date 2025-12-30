import React, { lazy } from 'react';
import { Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './routeGuards';
import AdminLayout from '@/components/admin/AdminLayout.jsx';

// Lazy load das páginas admin
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard.jsx'));

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
            <Route 
                path="/admin/dashboard" 
                element={<AdminDashboard />} 
            />
        </Route>
    </>
);

