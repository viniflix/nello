import React, { lazy } from 'react';
import { Route } from 'react-router-dom';
import { AuthWrapper } from './routeGuards';

// Lazy load das páginas de autenticação
const LoginPage = lazy(() => import('@/pages/auth/LoginPage.jsx'));
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage.jsx'));
const UpdatePasswordPage = lazy(() => import('@/pages/auth/UpdatePasswordPage.jsx'));
const AuthVerifyPage = lazy(() => import('@/pages/auth/AuthVerifyPage.jsx'));
const RedeemDeepLinkPage = lazy(() => import('@/pages/auth/RedeemDeepLinkPage.jsx'));

export const authRoutes = (
    <>
        <Route path="/login" element={<AuthWrapper><LoginPage /></AuthWrapper>} />
        <Route path="/register" element={<AuthWrapper><RegisterPage /></AuthWrapper>} />
        <Route path="/update-password" element={<UpdatePasswordPage />} />
        {/* Rota Desprotegida p/ Tratar Acesso Híbrido (Deslogado/Logado) */}
        <Route path="/convite" element={<RedeemDeepLinkPage />} />
        {/* Supabase Auth Verification Routes */}
        <Route path="/auth/v1/verify" element={<AuthVerifyPage />} />
        <Route path="/auth/verify" element={<AuthVerifyPage />} />
    </>
);

