import { supabase } from '@/infrastructure/supabase/client';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

export async function listClinicalProtocols(domain = null) {
  const { data, error } = await supabase.rpc('list_clinical_protocol_catalog', { p_domain: domain });
  if (error) logSupabaseError('Erro ao carregar protocolos científicos', error);
  return { data: data || [], error };
}

export async function recordClinicalProtocolDecision({ code, version, decision, reason }) {
  const { data, error } = await supabase.rpc('accept_clinical_protocol', {
    p_code: code,
    p_version: version,
    p_decision: decision,
    p_reason: reason,
  });
  if (error) logSupabaseError('Erro ao registrar decisão sobre protocolo', error);
  return { data, error };
}
