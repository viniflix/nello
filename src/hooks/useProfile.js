import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/customSupabaseClient';

/**
 * Hook de busca de perfil de usuário com TanStack Query (v5).
 * Gerencia cache global, retries e estado de carregamento.
 * 
 * @param {string} userId - ID do usuário para busca
 * @returns {Object} query result
 */
export function useProfile(userId) {
  return useQuery({
    queryKey: ['profile', userId],
    queryFn: async () => {
      if (!userId) return null;

      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Perfil não encontrado - pode acontecer em novos cadastros antes do trigger finalizar
          throw new Error('PROFILE_NOT_FOUND');
        }
        throw error;
      }

      if (!profile) return null;

      // Mapeamento de normalização para compatibilidade com a versão anterior do AuthContext
      return {
        ...profile,
        name: profile?.full_name ?? profile?.name,
        user_type: profile?.user_type ?? profile?.role,
        is_admin: profile?.is_admin === true,
      };
    },
    enabled: !!userId,
    // Cache de 30 minutos (staleTime) e garbage collection de 1 hora
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
    // Retentativas amigáveis para lidar com latência de rede ou cold start do banco
    retry: (failureCount, error) => {
      if (error.message === 'PROFILE_NOT_FOUND') {
        return failureCount < 4; // Mais retentativas para perfis novos
      }
      return failureCount < 2;
    },
    retryDelay: (attempt) => Math.min(attempt * 500, 3000),
  });
}
