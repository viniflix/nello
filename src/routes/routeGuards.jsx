import React from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

// Fallback de carregamento para Suspense
export const PageLoadingFallback = () => (
    <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
    </div>
);

// Wrapper para rotas de autenticação (login, register)
export const AuthWrapper = ({ children }) => {
    const { user, loading } = useAuth();

    if (loading) {
        return <PageLoadingFallback />;
    }

    if (user) {
        const redirectPath = user.profile.user_type === 'nutritionist' ? '/nutritionist' : '/patient';
        return <Navigate to={redirectPath} replace />;
    }

    return children;
};

// Componente de rota protegida
export const ProtectedRoute = ({ children, userType, requireAdmin = false, allowAnyUserType = false }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <PageLoadingFallback />;
  }

  if (!user || !user.profile) {
    return <Navigate to="/login" replace />;
  }

  const isAdmin = user.profile.is_admin === true;

  // CRITICAL: If user is admin, allow access to ANY route (God Mode)
  // The AdminModeContext will handle the visual masking
  if (isAdmin) {
    console.log('[ProtectedRoute] Admin access granted, bypassing user_type check');
    return children;
  }

  // Admin-only routes: require admin flag
  if (requireAdmin) {
    const correctDashboard = user.profile.user_type === 'nutritionist' ? '/nutritionist' : '/patient';
    return <Navigate to={correctDashboard} replace />;
  }

  // Regular routes: check user_type
  if (userType && user.profile.user_type !== userType) {
    const correctDashboard = user.profile.user_type === 'nutritionist' ? '/nutritionist' : '/patient';
    return <Navigate to={correctDashboard} replace />;
  }

  return children;
};

