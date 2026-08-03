import React from 'react';
import { Route } from 'react-router-dom';
import { AuthWrapper } from './routeGuards';
import { lazyWithReload } from '@/lib/utils/lazyWithReload';

// Lazy load das páginas de autenticação
const LoginPage = lazyWithReload(() => import('@/pages/auth/LoginPage.jsx'), 'auth:login');
const RegisterPage = lazyWithReload(() => import('@/pages/auth/RegisterPage.jsx'), 'auth:register');
const UpdatePasswordPage = lazyWithReload(() => import('@/pages/auth/UpdatePasswordPage.jsx'), 'auth:update-password');
const AuthVerifyPage = lazyWithReload(() => import('@/pages/auth/AuthVerifyPage.jsx'), 'auth:verify');
const RedeemDeepLinkPage = lazyWithReload(() => import('@/pages/auth/RedeemDeepLinkPage.jsx'), 'auth:invite');

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

