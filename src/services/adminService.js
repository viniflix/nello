import { supabase } from '@/lib/customSupabaseClient';

/**
 * Busca estatísticas do dashboard administrativo
 * Chama a função RPC get_admin_dashboard_stats
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function getDashboardStats() {
  try {
    const { data, error } = await supabase.rpc('get_admin_dashboard_stats');
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('[adminService] Erro inesperado ao buscar estatísticas:', error);
    return { data: null, error };
  }
}

/**
 * Busca a lista de nutricionistas ativos no sistema
 * @returns {Promise<{data: Array|null, error: object|null}>}
 */
export async function getNutritionistsList() {
  try {
    const { data, error } = await supabase.rpc('get_nutritionists_list');
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('[adminService] Erro inesperado ao buscar nutricionistas:', error);
    return { data: null, error };
  }
}

/**
 * Busca os logs em tempo real do sistema (Activity + Observability)
 * @param {number} limit - Limite de registros a retornar (default: 50)
 * @returns {Promise<{data: Array|null, error: object|null}>}
 */
export async function getSystemLiveLogs(limit = 50) {
  try {
    const { data, error } = await supabase.rpc('get_system_live_logs', { limit_count: limit });
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('[adminService] Erro inesperado ao buscar live logs:', error);
    return { data: null, error };
  }
}
