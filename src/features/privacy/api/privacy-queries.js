import { supabase } from '@/infrastructure/supabase/client';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

const rpc = async (name, payload = {}) => {
  const { data, error } = await supabase.rpc(name, payload);
  if (error) logSupabaseError(`Erro no fluxo de privacidade: ${name}`, error);
  return { data, error };
};

export const createMyPrivacyRequest = (requestType, subjectNote) => rpc('create_my_data_subject_request', {
  p_request_type: requestType,
  p_subject_note: subjectNote || null,
});
export const listMyPrivacyRequests = () => rpc('list_my_data_subject_requests');
export const cancelMyPrivacyRequest = (requestId) => rpc('cancel_my_data_subject_request', { p_request_id: requestId });
export const listPrivacyRequestsForAdmin = (status = null) => rpc('list_data_subject_requests', { p_status: status });
export const updatePrivacyRequest = ({ requestId, revision, status, reason, retentionDecision = null, legalBasis = null }) => rpc('update_data_subject_request', {
  p_request_id: requestId,
  p_expected_revision: revision,
  p_status: status,
  p_reason: reason,
  p_retention_decision: retentionDecision,
  p_legal_basis: legalBasis,
  p_assign_to_me: true,
});
