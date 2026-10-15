import {SectionLoading} from '@/components/ui/section-loading';
import {isSessionIndependentPath,preservesPublicDraft} from '@/app/router/publicRoutePolicy';
import { logDiagnostic } from '@/infrastructure/observability/safeLogger';
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/infrastructure/supabase/client';
import { useNavigate, useLocation } from 'react-router-dom';
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
import { clearPrivateDraftStorage } from '@/lib/utils/privateDraftStorage';
import { setPrivateSessionOwner, getPrivateSessionEpoch } from '@/lib/utils/privateSessionState';
import { useAccessEpoch } from '@/hooks/useAccessEpoch';
import { getAccessEpoch } from '@/infrastructure/realtime/accessEpochState';
import { clearPasswordReminders } from '@/features/auth/passwordReminder';
import { Button } from '@/components/ui/button';

const AuthLoadingFallback = () => <SectionLoading fullPage label="Verificando sessão..."/>;

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
  const { pathname } = useLocation();
  const processingSession = useRef(false);
  const identityRef = useRef(null);
  const authEventEpoch = useRef(0);
  const sessionClosed = useRef(false);
  const queryClient = useQueryClient();
  const accessEpoch = useAccessEpoch(user?.id);
  const profileSessionEpoch = getPrivateSessionEpoch();

  const clearPrivateClientState = useCallback(() => {
    clearPasswordReminders();
    try { clearPrivateDraftStorage(); } catch { /* Storage can be unavailable. */ }
    queryClient.clear();
    clearObservabilityUser();
  }, [queryClient]);

  // Busca o perfil via React Query
  const { data: profile, isError: isProfileError, isFetching: isProfileFetching, refetch: refetchProfile } = useProfile(user?.id);

  useEffect(() => {
    let active = true;
    const sessionEpoch = getPrivateSessionEpoch();
    if (!user?.id || profile?.user_type !== 'nutritionist') return undefined;
    setUser(previous => previous?.id === user.id ? {...previous, verification:null} : previous);

    getMyProfessionalVerification().then(({ data, error }) => {
      if (!active || sessionEpoch !== getPrivateSessionEpoch() || accessEpoch !== getAccessEpoch(user.id) || error || !data) return;
      setUser(previous => previous?.id === user.id
        ? { ...previous, verification: data }
        : previous);
    });

    return () => { active = false; };
  }, [user?.id, profile?.user_type, accessEpoch, profileSessionEpoch]);

  // Sincronização em tempo real (Realtime)


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
    if (profile && user?.id && profile.id === user.id) {
      setUser(prev => {
        if (!prev || prev.id !== user.id) return prev;
        // Só atualiza se o perfil for diferente ou novo para evitar re-renders infinitos
        if (JSON.stringify(prev.profile) === JSON.stringify(profile)) return prev;
        return { ...prev, profile };
      });

      // Identifica o usuário no Analytics (agora com dados sanitizados)
      setObservabilityUser({ id: user.id, profile });
    } else if (isProfileError && isOffline) {
        // Se houver erro de perfil mas estivermos offline, mantemos o que temos (graceful degradation)
        if (import.meta.env.DEV) logDiagnostic('warn', 'contexts/AuthContext.jsx:120', '[AuthContext] Perfil indisponível devido a offline, mantendo sessão.');
    }
  }, [profile, user?.id, isProfileError, isOffline]);

  const signOut = useCallback(async (redirect = true) => {
    sessionClosed.current = true;
    authEventEpoch.current += 1;
    pendingSessionRef.current = null;
    track(Events.AUTH_LOGOUT,{operation:'auth_session_end',outcome:'succeeded'});
    clearPrivateClientState();
    identityRef.current = null;
    setUser(null);
    try {
      await supabase.auth.signOut();
    } catch (error) {
      logDiagnostic('error', 'contexts/AuthContext.jsx:131', 'Erro ao fazer logout:', error);
    }
    if (redirect) navigate('/login', { replace: true });
  }, [navigate, clearPrivateClientState]);

  const profileDeactivated = Boolean(user?.id && profile?.id === user.id && profile.is_active === false);
  useEffect(() => {
    if (profileDeactivated && !isProfileError && !isProfileFetching && !sessionClosed.current) {
      void signOut(!isSessionIndependentPath(pathname));
    }
  }, [profileDeactivated, isProfileError, isProfileFetching, signOut, pathname]);

  // Auxiliar: processa a sessão (usado por getSession + onAuthStateChange)
  const pendingSessionRef = useRef(null);

  const processSession = useCallback(async (session, event) => {
    pendingSessionRef.current = { session, event, epoch: authEventEpoch.current };
    if (processingSession.current) return;
    processingSession.current = true;

    try {
      while (pendingSessionRef.current) {
        const { session: nextSession, event: nextEvent, epoch } = pendingSessionRef.current;
        pendingSessionRef.current = null;
        if (epoch !== authEventEpoch.current) continue;
        if (sessionClosed.current && nextSession?.user && !['SIGNED_IN','PASSWORD_RECOVERY'].includes(nextEvent)) continue;

        if (!nextSession?.user) {
          if (identityRef.current || nextEvent === 'SIGNED_OUT') clearPrivateClientState();
          identityRef.current = null;
          setUser(null);
          continue;
        }

        if (identityRef.current && identityRef.current !== nextSession.user.id) {
          clearPrivateClientState();
        }
        identityRef.current = nextSession.user.id;
        sessionClosed.current = false;
        setPrivateSessionOwner(nextSession.user.id);

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
            if (epoch !== authEventEpoch.current || identityRef.current !== nextSession.user.id) continue;
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
      logDiagnostic('error', 'contexts/AuthContext.jsx:193', '[AuthContext] Erro no processSession:', error);
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
  }, [queryClient, clearPrivateClientState]);

  useEffect(() => {
    let mounted = true;
    const initialEpoch = authEventEpoch.current;

    const initAuth = async () => {
      // Não usamos setLoading(true) aqui, initializing=true (default) é suficiente para o splash screen.

      // Failsafe de segurança: evita travar em "Verificando sessão..." para sempre
      const failsafe = setTimeout(() => {
        if (mounted) {
          logDiagnostic('warn', 'contexts/AuthContext.jsx:220', '[AuthContext] Verificação inicial de sessão expirou, forçando initializing=false');
          setInitializing(false);
        }
      }, 10000); // 10 seconds timeout

      try {
        // Recupera a sessão da memória/armazenamento
        const { data, error } = await supabase.auth.getSession();

        if (error) throw error;

        if (!mounted || initialEpoch !== authEventEpoch.current) {
          clearTimeout(failsafe);
          return;
        }

        if (data?.session?.user) {
          // Aguarda o processamento inicial da sessão
          await processSession(data.session, 'INITIAL_SESSION');
        } else {
          if (identityRef.current) clearPrivateClientState();
          identityRef.current = null;
          setUser(null);
        }
      } catch (err) {
        if (!mounted || initialEpoch !== authEventEpoch.current) return;
        // GRACEFUL DEGRADATION: Se falhar por rede, mas houver uma sessão local, não desloga.
        const isNetworkError = !window.navigator.onLine || err.message?.includes('fetch');
        if (isNetworkError) {
            logDiagnostic('warn', 'contexts/AuthContext.jsx:248', '[AuthContext] Falha de rede no boot, tentando manter sessão local.');
            setIsOffline(true);
        } else {
            logDiagnostic('error', 'contexts/AuthContext.jsx:251', '[AuthContext] Erro fatal durante initAuth:', err);
            if (mounted) {
              if (identityRef.current) clearPrivateClientState();
              identityRef.current = null;
              setUser(null);
            }
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      const ticket = ++authEventEpoch.current;
      if (session?.user?.id && identityRef.current && identityRef.current !== session.user.id) {
        clearPrivateClientState(); identityRef.current = null; setUser(null);
      }

      if (event === 'SIGNED_OUT') {
        sessionClosed.current = true;
        pendingSessionRef.current = null;
        clearPrivateClientState();
        identityRef.current = null;
        setUser(null);
        setLoading(false);
        return;
      }
      // Auth notifications run under the SDK's session lock. Never await a
      // profile RPC inside that callback: the RPC needs the same lock.
      setTimeout(async () => {
      if (!mounted || ticket !== authEventEpoch.current) return;
      // NOVO: Refresh silencioso - atualiza o token sem disparar o loader ou re-buscar o perfil
      if (event === 'TOKEN_REFRESHED') {
        if (session?.user) {
          if (!identityRef.current || identityRef.current !== session.user.id) {
            await processSession(session, event);
          } else {
            setUser(prev => prev ? { ...session.user, profile: prev.profile, verification: prev.verification } : null);
          }
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
            if (identityRef.current) clearPrivateClientState();
            identityRef.current = null;
            setUser(null);
          }
        }
      } catch (err) {
        if (import.meta.env.DEV) logDiagnostic('error', 'contexts/AuthContext.jsx:316', '[AuthContext] Erro no handler onAuthStateChange:', err);
      }
      }, 0);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [processSession, clearPrivateClientState]);

  const updateUserProfile = (newProfileData) => {
    setUser(currentUser => {
        if (!currentUser || currentUser.id !== user?.id || profileSessionEpoch !== getPrivateSessionEpoch()) return currentUser;
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
      {profileDeactivated && !isSessionIndependentPath(pathname) ? <AuthLoadingFallback /> : !isSessionIndependentPath(pathname)
        && (initializing || (loading && !user) || (user && !user.profile))
        ? !initializing && user && !user.profile && isProfileError
          ? <div className="flex min-h-dvh items-center justify-center bg-background px-6">
              <div className="flex max-w-md flex-col items-center gap-4 text-center">
                <div role="alert">
                  <h1 className="text-lg font-semibold text-foreground">Não foi possível carregar seu perfil</h1>
                  <p className="mt-2 text-sm text-muted-foreground">Confira sua conexão e tente novamente. Você também pode sair e entrar de novo.</p>
                </div>
                <Button onClick={() => refetchProfile()} disabled={isProfileFetching}>Tentar novamente</Button>
                <Button variant="outline" onClick={signOut}>Sair da conta</Button>
              </div>
            </div>
          : <AuthLoadingFallback />
        : <React.Fragment key={preservesPublicDraft(pathname)?'public-content':`${user?.id || 'anonymous'}:${profileSessionEpoch}`}>{children}</React.Fragment>}
    </AuthContext.Provider>
  );
}
