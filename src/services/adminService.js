import { supabase } from '@/lib/customSupabaseClient';

export async function getDashboardStats() {
  try {
    const { data, error } = await supabase.rpc('get_admin_dashboard_stats');
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('[adminService] getDashboardStats:', error);
    return { data: null, error };
  }
}

export async function getNutritionistsList() {
  try {
    const { data, error } = await supabase.rpc('get_nutritionists_list');
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('[adminService] getNutritionistsList:', error);
    return { data: null, error };
  }
}

export async function getSystemLiveLogs(limit = 50) {
  try {
    const { data, error } = await supabase.rpc('get_system_live_logs', { limit_count: limit });
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('[adminService] getSystemLiveLogs:', error);
    return { data: null, error };
  }
}

/**
 * Busca todas as métricas da Área de Estudo TCC
 * RPC: get_tcc_study_metrics()
 */
export async function getTCCStudyMetrics() {
  try {
    const { data, error } = await supabase.rpc('get_tcc_study_metrics');
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('[adminService] getTCCStudyMetrics:', error);
    return { data: null, error };
  }
}
