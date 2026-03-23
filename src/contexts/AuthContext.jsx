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

  // Self-healing function to create profile if missing
  const createProfileIfMissing = useCallback(async (sessionUser) => {
    const metadata = sessionUser.user_metadata || {};
    
    // Ensure user_type is present (CRITICAL for profile creation)
    const userType = metadata.user_type || metadata.userType || 'patient';
    if (!['patient', 'nutritionist'].includes(userType)) {
      console.error('Invalid user_type in metadata:', userType, 'Defaulting to "patient"');
    }
    
    // Extract required fields from metadata (DB usa name e user_type)
    const profileData = {
      id: sessionUser.id,
      email: sessionUser.email,
      name: metadata.full_name || metadata.name || metadata.display_name || 'Usuário',
      user_type: ['patient', 'nutritionist'].includes(userType) ? userType : 'patient',
      avatar_url: metadata.avatar_url || null,
      needs_password_reset: metadata.needs_password_reset === true,
    };


    try {
      const { data: newProfile, error: insertError } = await supabase
        .from('user_profiles')
        .insert(profileData)
        .select()
        .single();

      if (insertError) {
        // Handle race condition: Profile was created by DB trigger just before our insert
        const isConflictError = 
          insertError.code === '23505' || // PostgreSQL Unique Violation
          insertError.code === 'PGRST301' || // PostgREST Conflict
          insertError.status === 409 || // HTTP Conflict
          insertError.message?.includes('duplicate key') ||
          insertError.message?.includes('already exists');

        if (isConflictError) {

          // Retry fetching the profile - it should exist now
          const { data: existingProfile, error: fetchError } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', sessionUser.id)
            .single();

          if (fetchError) {
            console.error('Failed to fetch profile after conflict (self-healing):', {
              code: fetchError.code,
              message: fetchError.message,
              details: fetchError.details,
            });
            return null;
          }

          if (existingProfile) {
            const normalized = { ...existingProfile, name: existingProfile.full_name ?? existingProfile.name, user_type: existingProfile.user_type ?? existingProfile.role, is_admin: existingProfile.is_admin === true };
            return normalized;
          }

          console.error('Profile not found after conflict resolution');
          return null;
        }

        console.error('Error creating profile (self-healing):', {
          code: insertError.code,
          message: insertError.message,
          details: insertError.details,
          status: insertError.status,
          profileData: { id: profileData.id, name: profileData.name, user_type: profileData.user_type, email: profileData.email },
        });
        return null;
      }

      const normalizedNew = { ...newProfile, name: newProfile.full_name ?? newProfile.name, user_type: newProfile.user_type ?? newProfile.role, is_admin: newProfile.is_admin === true };
      return normalizedNew;
    } catch (error) {
      // Check if it's a conflict error in the catch block too
      const isConflictError = 
        error.code === '23505' ||
        error.code === 'PGRST301' ||
        error.status === 409 ||
        error.message?.includes('duplicate key') ||
        error.message?.includes('already exists');

      if (isConflictError) {

        // Retry fetching the profile
        const { data: existingProfile, error: fetchError } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', sessionUser.id)
          .single();

        if (fetchError) {
          console.error('Failed to fetch profile after conflict (self-healing - exception):', {
            code: fetchError.code,
            message: fetchError.message,
          });
          return null;
        }

        if (existingProfile) {
          const normalized = { ...existingProfile, name: existingProfile.full_name ?? existingProfile.name, user_type: existingProfile.user_type ?? existingProfile.role, is_admin: existingProfile.is_admin === true };
          return normalized;
        }

        return null;
      }

      console.error('Exception during profile creation (self-healing):', {
        error,
        message: error.message,
        code: error.code,
        status: error.status,
        profileData: { id: profileData.id, name: profileData.name, user_type: profileData.user_type },
      });
      return null;
    }
  }, []);

  // Fetch or create profile
  const fetchOrCreateProfile = useCallback(async (sessionUser) => {
    // Try to fetch existing profile
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', sessionUser.id)
      .single();

    // If profile exists, return it (normalizado para compatibilidade: name/user_type)
    if (profile && !error) {
      const normalized = {
        ...profile,
        name: profile.full_name ?? profile.name,
        user_type: profile.user_type ?? profile.role,
        is_admin: profile.is_admin === true,
      };
      return normalized;
    }

    // If error is PGRST116 (no rows found), try self-healing
    if (error?.code === 'PGRST116') {
      console.warn('Profile not found (PGRST116), attempting self-healing...');
      const newProfile = await createProfileIfMissing(sessionUser);
      if (newProfile) {
        return newProfile;
      }
      // If self-healing fails, return null (will be handled by caller)
      return null;
    }

    // For other errors, log and return null
    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }

    return null;
  }, [createProfileIfMissing]);

  // Helper: process session and set user state (used by getSession + onAuthStateChange)
  const processSession = useCallback(async (session, event) => {
    // Prevent multiple concurrent session processing
    if (processingSession.current) return;
    processingSession.current = true;

    try {
      if (!session?.user) {
        setUser(null);
        return;
      }

      const profile = await fetchOrCreateProfile(session.user);
      if (!profile) {
        console.error('Failed to fetch or create profile, signing out');
        await signOut();
        return;
      }

      setUser({ ...session.user, profile });
      
      try {
        identifyUser({ ...session.user, profile }); // PostHog: identifica usuário
      } catch (err) {
        if (import.meta.env.DEV) console.error('[AuthContext] Analytics error:', err);
      }
      
      // Auto-redirect only on SIGNED_IN (not on INITIAL_SESSION, TOKEN_REFRESHED)
      if (event === 'SIGNED_IN') {
        const currentPath = window.location.pathname;
        if (currentPath === '/login' || currentPath === '/register') {
          const redirectPath = profile.user_type === 'nutritionist' ? '/nutritionist' : '/patient';
          setTimeout(() => navigate(redirectPath, { replace: true }), 100);
        }
      }
    } catch (error) {
      console.error('[AuthContext] Error in processSession:', error);
      // Fallback: ensure app doesn't hang if an unexpected error occurs
      if (event === 'INITIAL_SESSION') {
        setUser(null);
      }
    } finally {
      processingSession.current = false;
    }
  }, [fetchOrCreateProfile, signOut, navigate]);

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
          await processSession(session, event);
          // Only set loading false here if we are sure we have the user
          setLoading(false);
        } else if (event === 'SIGNED_OUT') {
          // SIGNED_OUT already handled above, but just in case
          setUser(null);
          setLoading(false);
        } else if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
           // We let initAuth handle the initial loading state for these events
           // to avoid race conditions where this fires with null before getSession completes
           if (!session) {
             setUser(null);
           }
        }
      } catch (err) {
        if (import.meta.env.DEV) console.error('[AuthContext] Error in onAuthStateChange handler:', err);
        // Don't set loading false here, let the failsafe or initAuth handle it
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