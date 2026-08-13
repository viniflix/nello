import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMyPrivacyRequest, updatePrivacyRequest } from './privacy-queries';

vi.mock('@/infrastructure/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));
vi.mock('@/lib/supabase/query-helpers', () => ({ logSupabaseError: vi.fn() }));
const { supabase } = await import('@/infrastructure/supabase/client');

beforeEach(() => { vi.clearAllMocks(); supabase.rpc.mockResolvedValue({ data: {}, error: null }); });

describe('C8 data subject request contracts', () => {
  it('creates a patient-owned request without accepting a subject id', async () => {
    await createMyPrivacyRequest('access', 'Solicito meus dados');
    expect(supabase.rpc).toHaveBeenCalledWith('create_my_data_subject_request', { p_request_type: 'access', p_subject_note: 'Solicito meus dados' });
  });
  it('uses optimistic concurrency and explicit retention decision in admin updates', async () => {
    await updatePrivacyRequest({ requestId: 'request-1', revision: 3, status: 'fulfilled', reason: 'Resposta completa ao titular.', retentionDecision: 'retain_legal_obligation', legalBasis: 'Guarda clínica aplicável.' });
    expect(supabase.rpc).toHaveBeenCalledWith('update_data_subject_request', {
      p_request_id: 'request-1', p_expected_revision: 3, p_status: 'fulfilled', p_reason: 'Resposta completa ao titular.', p_retention_decision: 'retain_legal_obligation', p_legal_basis: 'Guarda clínica aplicável.', p_assign_to_me: true,
    });
  });
});
