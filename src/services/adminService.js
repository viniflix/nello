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

export async function listProfessionalVerifications({ status = null, role = null } = {}) {
  try {
    const { data, error } = await supabase.rpc('list_professional_verifications', {
      p_status: status || null,
      p_role: role || null
    });
    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    console.error('[adminService] listProfessionalVerifications:', error);
    return { data: null, error };
  }
}

export async function reviewProfessionalVerification({ verificationId, decision, reason, sourceUrl, validUntil }) {
  if (!reason?.trim()) return { data: null, error: new Error('Justificativa obrigatória.') };
  try {
    const { data, error } = await supabase.rpc('review_professional_verification', {
      p_verification_id: verificationId,
      p_decision: decision,
      p_reason: reason.trim(),
      p_source_url: sourceUrl || null,
      p_valid_until: validUntil || null
    });
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

export async function requestProfessionalVerificationInformation(verificationId, reason) {
  if (!reason?.trim()) return { data: null, error: new Error('Justificativa obrigatória.') };
  try {
    const { data, error } = await supabase.rpc('request_verification_information', {
      p_verification_id: verificationId,
      p_reason: reason.trim()
    });
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

export async function suspendProfessionalVerification(verificationId, reason) {
  if (!reason?.trim()) return { data: null, error: new Error('Justificativa obrigatória.') };
  try {
    const { data, error } = await supabase.rpc('suspend_professional_verification', {
      p_verification_id: verificationId,
      p_reason: reason.trim()
    });
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}
