import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ForcePasswordUpdate from '@/components/patient/ForcePasswordUpdate';

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
    const { user, loading, initializing } = useAuth();
    const location = useLocation();

    if (initializing || (loading && !user)) {
        return <PageLoadingFallback />;
    }

    const from = location.state?.from?.pathname || (user?.profile?.user_type === 'nutritionist' ? '/nutritionist' : '/patient');

    if (user) {
        return <Navigate to={from} replace />;
    }

    return children;
};

// Componente de rota protegida
export const ProtectedRoute = ({ children, userType, requireAdmin = false, allowAnyUserType = false }) => {
  const { user, loading, initializing } = useAuth();
  const location = useLocation();

  if (initializing || (loading && !user)) {
    return <PageLoadingFallback />;
  }

  if (!user || !user.profile) {
    // Save current location to redirect back after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const isAdmin = user.profile.is_admin === true;

  // Admin tem acesso a qualquer rota
  if (isAdmin) {
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

  // Interceptador para paciente que não atualizou a senha ainda
  if (user.profile.user_type === 'patient' && user.profile.needs_password_reset === true) {
    return <ForcePasswordUpdate />;
  }

  return children;
};

