import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useNavigate } from 'react-router-dom';
import {
  captureOperationalError,
  clearObservabilityUser,
  setObservabilityUser,
} from '@/infrastructure/observability/telemetry';
import { useQueryClient } from '@tanstack/react-query';
import { useProfile } from '@/hooks/useProfile';
import { getMyProfessionalVerification } from '@/lib/supabase/verification-queries';
import { redeemPatientInvite } from '@/features/auth/authFlows';
import { Events, track } from '@/infrastructure/analytics/posthog';

const AuthLoadingFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Verificando sessão...</p>
    </div>
  </div>
);

const AuthContext = createContext();

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [isOffline, setIsOffline] = useState(!window.navigator.onLine);
  const navigate = useNavigate();
  const processingSession = useRef(false);
  const queryClient = useQueryClient();

  // Busca o perfil via React Query
  const { data: profile, isLoading: isProfileLoading, isError: isProfileError } = useProfile(user?.id);

  useEffect(() => {
    let active = true;
    if (!user?.id || profile?.user_type !== 'nutritionist') return undefined;

    getMyProfessionalVerification().then(({ data, error }) => {
      if (!active || error || !data) return;
      setUser(previous => previous?.id === user.id
        ? { ...previous, verification: data }
        : previous);
    });

    return () => { active = false; };
  }, [user?.id, profile?.user_type]);

  // Sincronização em tempo real (Realtime)
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`profile-updates-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_profiles',
          filter: `id=eq.${user.id}`
        },
        () => {
          if (import.meta.env.DEV) console.log('[AuthContext] Realtime invalidate query: profile');
          queryClient.invalidateQueries({ queryKey: ['profile', user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  // Monitora conectividade global
  useEffect(() => {
    const handleStatusChange = () => setIsOffline(!window.navigator.onLine);
    window.addEventListener('online', handleStatusChange);
    window.addEventListener('offline', handleStatusChange);
    return () => {
      window.removeEventListener('online', handleStatusChange);
      window.removeEventListener('offline', handleStatusChange);
    };
  }, []);

  // Sincroniza o perfil do React Query com o estado do usuário do contexto
  useEffect(() => {
    if (profile) {
      setUser(prev => {
        if (!prev) return null;
        // Só atualiza se o perfil for diferente ou novo para evitar re-renders infinitos
        if (JSON.stringify(prev.profile) === JSON.stringify(profile)) return prev;
        return { ...prev, profile };
      });
      
      // Identifica o usuário no Analytics (agora com dados sanitizados)
      setObservabilityUser({ id: user.id, profile });
    } else if (isProfileError && isOffline) {
        // Se houver erro de perfil mas estivermos offline, mantemos o que temos (graceful degradation)
        if (import.meta.env.DEV) console.warn('[AuthContext] Perfil indisponível devido a offline, mantendo sessão.');
    }
  }, [profile, user?.id, isProfileError, isOffline]);

  const signOut = useCallback(async () => {
    setUser(null);
    clearObservabilityUser();
    queryClient.clear(); // Limpa cache global ao sair
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    }
    navigate('/login', { replace: true });
  }, [navigate, queryClient]);

  // Auxiliar: processa a sessão (usado por getSession + onAuthStateChange)
  const pendingSessionRef = useRef(null);

  const processSession = useCallback(async (session, event) => {
    pendingSessionRef.current = { session, event };
    if (processingSession.current) return;
    processingSession.current = true;

    try {
      while (pendingSessionRef.current) {
        const { session: nextSession, event: nextEvent } = pendingSessionRef.current;
        pendingSessionRef.current = null;

        if (!nextSession?.user) {
          setUser(null);
          clearObservabilityUser();
          continue;
        }

        // Agora apenas definimos o usuário base. O perfil virá via useProfile hook.
        // Se já temos um perfil cacheado, mantemos para evitar UI flickering
        setUser(prev => ({ 
          ...nextSession.user, 
          profile: prev?.id === nextSession.user.id ? prev.profile : null,
          verification: prev?.id === nextSession.user.id ? prev.verification : null
        }));

        // Uma sessão temporária de recuperação nunca deve resgatar convites.
        const pendingCode = localStorage.getItem('pending_invite_code');
        const isPasswordRecoveryRoute = window.location.pathname === '/update-password';
        if (pendingCode && nextEvent === 'SIGNED_IN' && !isPasswordRecoveryRoute) {
          try {
            const result = await redeemPatientInvite(supabase, pendingCode);
            if (result?.success) {
              queryClient.invalidateQueries({ queryKey: ['profile', nextSession.user.id] });
              localStorage.removeItem('pending_invite_code');
              track(Events.AUTH_INVITE_REDEEMED, { flow: 'pending_after_login' });
            }
          } catch (inviteError) {
            captureOperationalError(inviteError, {
              operation: 'auth.redeem_pending_invite',
              module: 'authentication',
              source: 'supabase_rpc',
            });
            if (/inválid|expir/i.test(inviteError.message || '')) {
              localStorage.removeItem('pending_invite_code');
            }
          }
        }
      }
    } catch (error) {
      console.error('[AuthContext] Erro no processSession:', error);
      captureOperationalError(error, {
        operation: 'auth.process_session',
        module: 'authentication',
        source: 'application',
      });
      if (event === 'INITIAL_SESSION') setUser(null);
    } finally {
      processingSession.current = false;
      // Não deixe um evento recebido durante o RPC aguardando até o reload.
      if (pendingSessionRef.current) {
        const pending = pendingSessionRef.current;
        pendingSessionRef.current = null;
        await processSession(pending.session, pending.event);
      }
    }
  }, [queryClient]);

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      // Não usamos setLoading(true) aqui, initializing=true (default) é suficiente para o splash screen.
      
      // Failsafe de segurança: evita travar em "Verificando sessão..." para sempre
      const failsafe = setTimeout(() => {
        if (mounted) {
          console.warn('[AuthContext] Verificação inicial de sessão expirou, forçando initializing=false');
          setInitializing(false);
        }
      }, 10000); // 10 seconds timeout

      try {
        // Recupera a sessão da memória/armazenamento
        const { data, error } = await supabase.auth.getSession();
        
        if (error) throw error;
        
        if (!mounted) {
          clearTimeout(failsafe);
          return;
        }

        if (data?.session?.user) {
          // Aguarda o processamento inicial da sessão
          await processSession(data.session, 'INITIAL_SESSION');
        } else {
          setUser(null);
        }
      } catch (err) {
        // GRACEFUL DEGRADATION: Se falhar por rede, mas houver uma sessão local, não desloga.
        const isNetworkError = !window.navigator.onLine || err.message?.includes('fetch');
        if (isNetworkError) {
            console.warn('[AuthContext] Falha de rede no boot, tentando manter sessão local.');
            setIsOffline(true);
        } else {
            console.error('[AuthContext] Erro fatal durante initAuth:', err);
            if (mounted) setUser(null);
        }
      } finally {
        // GARANTIDO: o app sempre sai do estado de loading se estiver montado
        if (mounted) {
          clearTimeout(failsafe);
          setInitializing(false);
        }
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_OUT') {
        setUser(null);
        clearObservabilityUser();
        setLoading(false);
        return;
      }

      // NOVO: Refresh silencioso - atualiza o token sem disparar o loader ou re-buscar o perfil
      if (event === 'TOKEN_REFRESHED') {
        if (session?.user) {
          setUser(prev => prev ? { ...session.user, profile: prev.profile, verification: prev.verification } : null);
        }
        return;
      }

      try {
        if (session?.user) {
          // Só mostra loading visual se for um login explicito (quando não temos usuário ainda)
          // Se já temos um usuário, o processSession ocorre silenciosamente em background.
          const isNewLogin = !user && !initializing;
          
          if (isNewLogin) {
            setLoading(true);
          }
          
          // processSession sincroniza perfil e dados
          await processSession(session, event);
          
          if (isNewLogin) {
            setLoading(false);
          }
        } else if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
          if (!session) {
            setUser(null);
          }
        }
      } catch (err) {
        if (import.meta.env.DEV) console.error('[AuthContext] Erro no handler onAuthStateChange:', err);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [processSession]);

  const updateUserProfile = (newProfileData) => {
    setUser(currentUser => {
        if (!currentUser) return null;
        const updatedProfile = { ...currentUser.profile, ...newProfileData };
        return { ...currentUser, profile: updatedProfile };
    });
  }

  const value = {
    signUp: (data) => supabase.auth.signUp(data),
    signIn: (data) => supabase.auth.signInWithPassword(data),
    signOut,
    user,
    loading,
    initializing,
    isOffline,
    updateUserProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {(initializing || (loading && !user) || (user && !user.profile)) ? <AuthLoadingFallback /> : children}
    </AuthContext.Provider>
  );
}
