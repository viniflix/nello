import { clinicalClient as supabase } from '@/infrastructure/supabase/domainClients';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

export async function getMyProfessionalVerification() {
  try {
    const { data, error } = await supabase.rpc('get_my_professional_verification');
    if (error) throw error;
    return { data: data || { status: 'not_submitted', has_clinical_capacity: false }, error: null };
  } catch (error) {
    logSupabaseError("erro_ao_consultar_verificacao_profissional", error);
    return { data: null, error };
  }
}

export async function submitProfessionalVerification(payload) {
  try {
    const { data, error } = await supabase.rpc('submit_professional_verification', {
      p_payload: payload
    });
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError("erro_ao_enviar_verificacao_profissional", error);
    return { data: null, error };
  }
}
