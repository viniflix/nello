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
    throw new Error('useAuth must be used within an AuthProvider');
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
        console.warn('[AuthContext] Profile still missing after retries.');
        return null;
      }

      if (error) {
        console.error('[AuthContext] Error fetching profile:', error);
        return null;
      }
    }

    return null;
  }, []);

  // Helper: process session and set user state (used by getSession + onAuthStateChange)
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
          console.error('[AuthContext] Failed to fetch profile after retries, signing out');
          await signOut();
          continue;
        }

        setUser({ ...nextSession.user, profile });

        try {
          identifyUser({ ...nextSession.user, profile });
        } catch (err) {
          if (import.meta.env.DEV) console.error('[AuthContext] Analytics error:', err);
        }
      } catch (error) {
        console.error('[AuthContext] Error in processSession:', error);
        if (nextEvent === 'INITIAL_SESSION') {
          setUser(null);
        }
      }
    }

    processingSession.current = false;
  }, [fetchProfileWithRetry, signOut]);

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      // Ensure we start in loading state
      setLoading(true);
      
      // Safety failsafe: don't let the app hang on "Verificando sessão..." forever
      // This is critical if PostHog or Supabase calls hang due to ad-blockers or network
      const failsafe = setTimeout(() => {
        if (mounted) {
          console.warn('[AuthContext] Initial session check timed out, forcing loading=false');
          setLoading(false);
        }
      }, 10000); // 10 seconds timeout

      try {
        // Recovery of session from memory/storage
        const { data, error } = await supabase.auth.getSession();
        
        if (error) throw error;
        
        if (!mounted) {
          clearTimeout(failsafe);
          return;
        }

        if (data?.session?.user) {
          // Await the profile matching to ensure we have full user data before stopping loader
          await processSession(data.session, 'INITIAL_SESSION');
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error('[AuthContext] Fatal error during initAuth:', err);
        if (mounted) setUser(null);
      } finally {
        // GUARANTEED: app always leaves loading state if mounted
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
        if (import.meta.env.DEV) console.error('[AuthContext] Error in onAuthStateChange handler:', err);
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