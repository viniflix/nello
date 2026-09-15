import { supabase } from '@/infrastructure/supabase/client';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

export async function listClinicalProtocols(domain = null) {
  const { data, error } = await supabase.rpc('list_clinical_protocol_catalog', { p_domain: domain });
  if (error) logSupabaseError('Erro ao carregar protocolos científicos', error);
  return { data: data || [], error };
}

export async function recordClinicalProtocolDecision({ code, version, decision, reason }) {
  const normalizedReason = typeof reason === 'string' ? reason.trim() : '';
  const isValid = typeof code === 'string'
    && code.trim().length > 0
    && Number.isInteger(version)
    && version > 0
    && ['accepted', 'restricted', 'rejected'].includes(decision)
    && normalizedReason.length >= 10
    && normalizedReason.length <= 1000;
  if (!isValid) return { data: null, error: new Error('INVALID_PROTOCOL_DECISION') };

  const { data, error } = await supabase.rpc('accept_clinical_protocol', {
    p_code: code.trim(),
    p_version: version,
    p_decision: decision,
    p_reason: normalizedReason,
  });
  if (error) logSupabaseError('Erro ao registrar decisão sobre protocolo', error);
  return { data, error };
}
