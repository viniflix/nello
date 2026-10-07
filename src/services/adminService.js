import { logDiagnostic } from '@/infrastructure/observability/safeLogger';
import { supabase } from '@/infrastructure/supabase/client';
import { validateBriefing } from '@/portals/admin/model/sourceState';
import { validateProductMetrics } from '@/portals/admin/model/productMetrics';

export async function getAdminProductMetrics(days=30) {
  if (![30,90,180].includes(days)) return {data:null,error:new Error('invalid_analytics_window')};
  const {data,error}=await supabase.rpc('admin_product_analytics',{p_window_days:days});
  if(error)return {data:null,error};
  try {return {data:validateProductMetrics(data),error:null};} catch(error){return {data:null,error};}
}
export const getAdminProductCaptures = (days=30) => supabase.functions.invoke('sentry-proxy',{method:'POST',body:{action:'product_analytics',window_days:days}});

export async function getAdminBriefing() {
  const { data, error } = await supabase.rpc('admin_operational_briefing');
  if (error) return { data: null, error };
  try { return { data: validateBriefing(data), error: null }; }
  catch (contractError) { return { data: null, error: contractError }; }
}

export const getAdminIncidentState = (issueId) => supabase.rpc('admin_incident_state', { p_issue_id: String(issueId) });
export const triageAdminIncident = ({ issueId, revision, status, reason }) => supabase.rpc('admin_triage_incident', {
  p_issue_id: String(issueId), p_expected_revision: revision, p_status: status, p_reason: reason,
});
export const getAdminIntegrations = () => supabase.functions.invoke('sentry-proxy', { method: 'POST', body: { action: 'sources' } });
export const getAdminIssuePage = (filters) => supabase.functions.invoke('sentry-proxy', { method: 'POST', body: { action: 'issues_page', limit: 25, ...filters } });
export const getAdminIssueEvent = (issueId) => supabase.functions.invoke('sentry-proxy', { method: 'POST', body: { action: 'latest_event', issue_id: String(issueId) } });

export async function listAdminPeople({ search = '', type = 'all', page = 1 } = {}) {
  const { data, error } = await supabase.rpc('admin_list_people', {
    p_search: search,
    p_type: type,
    p_page: page,
  });
  return { data, error };
}

export async function getAdminWorkflowOverview() {
  const { data, error } = await supabase.rpc('admin_workflow_overview');
  return { data, error };
}

export async function getAdminSecurityOverview() {
  const { data, error } = await supabase.rpc('admin_security_overview');
  return { data, error };
}

export async function getAdminBrandMigrationStatus() {
  const { data, error } = await supabase.rpc('admin_brand_migration_status');
  return { data, error };
}

export async function getDashboardStats() {
  try {
    const { data, error } = await supabase.rpc('get_admin_dashboard_stats');
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logDiagnostic('error', 'services/adminService.js:33', '[adminService] getDashboardStats:', error);
    return { data: null, error };
  }
}

export async function getNutritionistsList() {
  try {
    const { data, error } = await supabase.rpc('get_nutritionists_list');
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logDiagnostic('error', 'services/adminService.js:44', '[adminService] getNutritionistsList:', error);
    return { data: null, error };
  }
}

export async function getSystemLiveLogs(limit = 50) {
  try {
    const { data, error } = await supabase.rpc('get_system_live_logs', { limit_count: limit });
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logDiagnostic('error', 'services/adminService.js:55', '[adminService] getSystemLiveLogs:', error);
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
    logDiagnostic('error', 'services/adminService.js:70', '[adminService] getTCCStudyMetrics:', error);
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
    logDiagnostic('error', 'services/adminService.js:84', '[adminService] listProfessionalVerifications:', error);
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
