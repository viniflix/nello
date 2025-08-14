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

  const fetchProfile = useCallback(async (userId) => {
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    
    if (error) {
      console.error("Error fetching user profile:", error);
      return null;
    }
    return profile;
  }, []);

  const handleSessionUpdate = useCallback(async (session) => {
    if (session?.user) {
        const profile = await fetchProfile(session.user.id);
        if (profile) {
            setUser({ ...session.user, profile });
        } else {
             await supabase.auth.signOut();
             setUser(null);
        }
    } else {
        setUser(null);
    }
    setLoading(false);
  },[fetchProfile]);
  
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    navigate('/login', { replace: true });
  }, [navigate]);
  
  const updateUserProfile = (newProfileData) => {
    setUser(currentUser => {
        if (!currentUser) return null;
        const updatedProfile = { ...currentUser.profile, ...newProfileData };
        return { ...currentUser, profile: updatedProfile };
    });
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      // Handle cases where token is invalid or session is lost
      if (_event === 'SIGNED_OUT' || !session) {
        setUser(null);
        setLoading(false);
        return;
      }
      if (_event === 'TOKEN_REFRESHED' || _event === 'INITIAL_SESSION' || _event === 'SIGNED_IN' || _event === 'USER_UPDATED') {
        if(session?.user){
            const profile = await fetchProfile(session.user.id);
            if(profile) {
                setUser({ ...session.user, profile });
            } else {
                await signOut();
            }
        }
      }
      setLoading(false);
    });

    const getInitialSession = async () => {
        const { data: { session }, error } = await supabase.auth.getSession();
        if(error || !session) {
            setLoading(false);
            return;
        }
        await handleSessionUpdate(session);
    }
    getInitialSession();

    return () => {
      subscription?.unsubscribe();
    };
  }, [fetchProfile, signOut, handleSessionUpdate]);

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