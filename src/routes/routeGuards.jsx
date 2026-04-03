import { Navigate, useLocation } from 'react-router-dom';
import { Loader2, WifiOff } from 'lucide-react';
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
// Componente exibido quando o usuário está offline e não temos o perfil no cache (primeiro acesso)
export const ConnectionRequired = () => (
    <div className="flex items-center justify-center h-screen bg-background p-6">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
            <div className="p-4 bg-muted rounded-full">
                <WifiOff className="w-10 h-10 text-muted-foreground" />
            </div>
            <h1 className="text-xl font-semibold">Conexão necessária</h1>
            <p className="text-sm text-muted-foreground">
                Não conseguimos carregar seu perfil para este primeiro acesso offline. 
                Por favor, conecte-se à internet para sincronizar seus dados.
            </p>
            <button 
                onClick={() => window.location.reload()}
                className="mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
            >
                Tentar novamente
            </button>
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
  const { user, loading, initializing, isOffline } = useAuth();
  const location = useLocation();

  if (initializing || loading) {
    return <PageLoadingFallback />;
  }

  // Se o usuário existe mas o perfil ainda está sendo carregado pelo hook useProfile
  // e não estamos offline (onde usaríamos o cache), mostramos o loading para evitar crash.
  if (user && !user?.profile && !isOffline) {
    return <PageLoadingFallback />;
  }

  // CASO CRÍTICO: Offline sem perfil em cache (ex: primeiro acesso no dispositivo)
  if (!user?.profile && isOffline && user) {
    return <ConnectionRequired />;
  }

  if (!user || (!user?.profile && !isOffline)) {
    // Save current location to redirect back after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Safeguard: Se chegamos aqui sem perfil (mesmo offline), precisamos esperar ou mostrar conexão necessária
  if (!user?.profile) {
    return isOffline ? <ConnectionRequired /> : <PageLoadingFallback />;
  }

  const isAdmin = user?.profile?.is_admin === true;

  // Admin tem acesso a qualquer rota
  if (isAdmin) {
    return children;
  }

  // Admin-only routes: require admin flag
  if (requireAdmin) {
    const correctDashboard = user?.profile?.user_type === 'nutritionist' ? '/nutritionist' : '/patient';
    return <Navigate to={correctDashboard} replace />;
  }

  // Regular routes: check user_type
  if (userType && user?.profile?.user_type !== userType) {
    const correctDashboard = user?.profile?.user_type === 'nutritionist' ? '/nutritionist' : '/patient';
    return <Navigate to={correctDashboard} replace />;
  }

  // Interceptador para paciente que não atualizou a senha ainda
  if (user?.profile?.user_type === 'patient' && user?.profile?.needs_password_reset === true) {
    return <ForcePasswordUpdate />;
  }

  return children;
};
