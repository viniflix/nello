import { supabase } from '@/lib/customSupabaseClient';
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
  return call('get_my_student_supervisions', undefined, 'Erro ao consultar supervisões');
}

export function requestStudentSupervision(email) {
  return call('request_student_supervision_by_email', {
    p_supervisor_email: email.trim().toLowerCase()
  }, 'Erro ao solicitar supervisão');
}

export function respondStudentSupervision(supervisionId, decision, reason) {
  return call('respond_student_supervision', {
    p_supervision_id: supervisionId,
    p_decision: decision,
    p_reason: reason
  }, 'Erro ao responder supervisão');
}

export function endStudentSupervision(supervisionId, reason) {
  return call('end_student_supervision', {
    p_supervision_id: supervisionId,
    p_reason: reason
  }, 'Erro ao encerrar supervisão');
}
