import { clinicalClient as supabase } from '@/infrastructure/supabase/domainClients';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

async function call(rpc, args, message) {
  try {
    const { data, error } = args === undefined
      ? await supabase.rpc(rpc)
      : await supabase.rpc(rpc, args);
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError(message, error);
    return { data: null, error };
  }
}

export function getMyStudentSupervisions() {
  return call('get_my_student_supervisions', undefined, "erro_ao_consultar_supervisoes");
}

export function requestStudentSupervision(email) {
  return call('request_student_supervision_by_email', {
    p_supervisor_email: email.trim().toLowerCase()
  }, "erro_ao_solicitar_supervisao");
}

export function respondStudentSupervision(supervisionId, decision, reason) {
  return call('respond_student_supervision', {
    p_supervision_id: supervisionId,
    p_decision: decision,
    p_reason: reason
  }, "erro_ao_responder_supervisao");
}

export function endStudentSupervision(supervisionId, reason) {
  return call('end_student_supervision', {
    p_supervision_id: supervisionId,
    p_reason: reason
  }, "erro_ao_encerrar_supervisao");
}
