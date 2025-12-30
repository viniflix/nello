import React, { lazy } from 'react';
import { Route } from 'react-router-dom';
import { AuthWrapper } from './routeGuards';

// Lazy load das páginas de autenticação
const LoginPage = lazy(() => import('@/pages/auth/LoginPage.jsx'));
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage.jsx'));
const UpdatePasswordPage = lazy(() => import('@/pages/auth/UpdatePasswordPage.jsx'));

export const authRoutes = (
    <>
        <Route path="/login" element={<AuthWrapper><LoginPage /></AuthWrapper>} />
        <Route path="/register" element={<AuthWrapper><RegisterPage /></AuthWrapper>} />
        <Route path="/update-password" element={<UpdatePasswordPage />} />
    </>
);

