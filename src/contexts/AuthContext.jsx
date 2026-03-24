import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useNavigate } from 'react-router-dom';
import { identifyUser, resetUser } from '@/analytics/posthog';

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
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const processingSession = useRef(false);

  const signOut = useCallback(async () => {
    setUser(null);
    resetUser(); // PostHog: limpa identidade ao sair
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    }
    navigate('/login', { replace: true });
  }, [navigate]);

  const fetchProfileWithRetry = useCallback(async (sessionUser, options = {}) => {
    const { retries = 3, delayMs = 400 } = options;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', sessionUser.id)
        .single();

      if (profile && !error) {
        return {
          ...profile,
          name: profile.full_name ?? profile.name,
          user_type: profile.user_type ?? profile.role,
          is_admin: profile.is_admin === true,
        };
      }

      if (error?.code === 'PGRST116') {
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
          continue;
        }
        console.warn('[AuthContext] Perfil ainda ausente após as tentativas.');
        return null;
      }

      if (error) {
        console.error('[AuthContext] Erro ao buscar perfil:', error);
        return null;
      }
    }

    return null;
  }, []);

  // Auxiliar: processa a sessão e ajusta o estado do usuário (usado por getSession + onAuthStateChange)
  const pendingSessionRef = useRef(null);

  const processSession = useCallback(async (session, event) => {
    pendingSessionRef.current = { session, event };
    if (processingSession.current) return;
    processingSession.current = true;

    while (pendingSessionRef.current) {
      const { session: nextSession, event: nextEvent } = pendingSessionRef.current;
      pendingSessionRef.current = null;

      try {
        if (!nextSession?.user) {
          setUser(null);
          continue;
        }

        const profile = await fetchProfileWithRetry(nextSession.user, { retries: 4, delayMs: 350 });
        if (!profile) {
          console.error('[AuthContext] Falha ao buscar perfil após tentativas, encerrando sessão');
          await signOut();
          continue;
        }

        setUser({ ...nextSession.user, profile });

        try {
          identifyUser({ ...nextSession.user, profile });
        } catch (err) {
          if (import.meta.env.DEV) console.error('[AuthContext] Erro de analytics:', err);
        }
      } catch (error) {
        console.error('[AuthContext] Erro no processSession:', error);
        if (nextEvent === 'INITIAL_SESSION') {
          setUser(null);
        }
      }
    }

    // Auto-resgate de código de convite se houver um pendente no localStorage
    const pendingCode = localStorage.getItem('pending_invite_code');
    if (pendingCode && nextSession?.user) {
        try {
            const { data, error } = await supabase.rpc('redeem_invite_code', {
                p_invite_code: pendingCode
            });
            
            if (error) throw error;
            
            if (data?.success) {
                // Se o perfil mudou (ex: ID alterado via claim), recarrega o perfil
                if (data.type === 'profile_claimed') {
                    const newProfile = await fetchProfileWithRetry(nextSession.user, { retries: 2 });
                    if (newProfile) {
                        setUser(curr => ({ ...curr, profile: newProfile }));
                    }
                }
                localStorage.removeItem('pending_invite_code');
                // Nota: Toasts não podem ser disparados aqui facilmente sem o hook useToast, 
                // mas como este contexto é global, podemos usar um evento ou deixar para a página de destino.
            }
        } catch (err) {
            console.error('[AuthContext] Erro ao resgatar convite pendente:', err);
            // Mantém no localStorage para tentar novamente ou limpa se for erro fatal? 
            // Melhor limpar se for erro de validação (ex: código inválido)
            if (err.message?.includes('inválido')) {
                localStorage.removeItem('pending_invite_code');
            }
        }
    }

    processingSession.current = false;
  }, [fetchProfileWithRetry, signOut]);

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      // Garantir início em estado de carregamento
      setLoading(true);
      
      // Failsafe de segurança: evita travar em "Verificando sessão..." para sempre
      // Importante caso PostHog ou Supabase travem por ad-blockers ou rede
      const failsafe = setTimeout(() => {
        if (mounted) {
          console.warn('[AuthContext] Verificação inicial de sessão expirou, forçando loading=false');
          setLoading(false);
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
          // Aguarda o perfil para garantir os dados completos antes de encerrar o loader
          await processSession(data.session, 'INITIAL_SESSION');
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error('[AuthContext] Erro fatal durante initAuth:', err);
        if (mounted) setUser(null);
      } finally {
        // GARANTIDO: o app sempre sai do estado de loading se estiver montado
        if (mounted) {
          clearTimeout(failsafe);
          setLoading(false);
        }
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        if (session?.user) {
          setLoading(true);
          await processSession(session, event);
          setLoading(false);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setLoading(false);
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
    updateUserProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {loading ? <AuthLoadingFallback /> : children}
    </AuthContext.Provider>
  );
}