import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useNavigate } from 'react-router-dom';

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

  const signOut = useCallback(async () => {
    // Limpar estado local
    setUser(null);

    // Fazer logout com Supabase (limpa automaticamente o storage)
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    }

    // Redirecionar para login
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
    
    // Extract required fields from metadata (DB usa full_name e role)
    const profileData = {
      id: sessionUser.id,
      email: sessionUser.email,
      full_name: metadata.full_name || metadata.name || metadata.display_name || 'Usuário',
      role: ['patient', 'nutritionist'].includes(userType) ? userType : 'patient',
      avatar_url: metadata.avatar_url || null,
    };

    console.log('Attempting self-healing profile creation with data:', {
      id: profileData.id,
      email: profileData.email,
      name: profileData.name,
      user_type: profileData.user_type,
      hasMetadata: !!metadata,
      metadataKeys: Object.keys(metadata),
    });

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
          console.log('Profile already exists (Race condition won by DB), fetching profile again...', {
            userId: sessionUser.id,
            errorCode: insertError.code,
            errorStatus: insertError.status,
          });

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
            const normalized = { ...existingProfile, name: existingProfile.full_name ?? existingProfile.name, user_type: existingProfile.role ?? existingProfile.user_type, is_admin: existingProfile.role === 'super_admin' };
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
          profileData: { id: profileData.id, full_name: profileData.full_name, role: profileData.role, email: profileData.email },
        });
        return null;
      }

      const normalizedNew = { ...newProfile, name: newProfile.full_name ?? newProfile.name, user_type: newProfile.role ?? newProfile.user_type, is_admin: newProfile.role === 'super_admin' };
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
        console.log('Profile already exists (Race condition won by DB - caught in exception), fetching profile again...', {
          userId: sessionUser.id,
          errorCode: error.code,
          errorStatus: error.status,
        });

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
          const normalized = { ...existingProfile, name: existingProfile.full_name ?? existingProfile.name, user_type: existingProfile.role ?? existingProfile.user_type, is_admin: existingProfile.role === 'super_admin' };
          return normalized;
        }

        return null;
      }

      console.error('Exception during profile creation (self-healing):', {
        error,
        message: error.message,
        code: error.code,
        status: error.status,
        profileData: { id: profileData.id, full_name: profileData.full_name, role: profileData.role },
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
        user_type: profile.role ?? profile.user_type,
        is_admin: profile.role === 'super_admin',
      };
      console.log('[AuthContext] Profile loaded:', { id: normalized.id, email: normalized.email, user_type: normalized.user_type, is_admin: normalized.is_admin });
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

  useEffect(() => {
    setLoading(true);
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setLoading(false);
        return;
      }
      
      if (session?.user) {
        const profile = await fetchOrCreateProfile(session.user);

        if (!profile) {
          console.error('Failed to fetch or create profile, signing out');
          await signOut();
          return;
        }

        setUser({ ...session.user, profile });
        
        // Auto-redirect ONLY on initial sign in (not on token refresh)
        // Token refresh should NOT cause redirects - user is already on a valid route
        if (event === 'SIGNED_IN') {
          // Only redirect if user is on login page
          const currentPath = window.location.pathname;
          if (currentPath === '/login' || currentPath === '/register') {
            const redirectPath = profile.user_type === 'nutritionist' ? '/nutritionist' : '/patient';
            // Use setTimeout to ensure navigation happens after state update
            setTimeout(() => {
              navigate(redirectPath, { replace: true });
            }, 100);
          }
        }
        // TOKEN_REFRESHED: Do nothing - user is already authenticated and on a valid route
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [signOut, fetchOrCreateProfile, navigate]);

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
      {!loading && children}
    </AuthContext.Provider>
  );
}