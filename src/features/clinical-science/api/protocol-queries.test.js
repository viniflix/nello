import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listClinicalProtocols, recordClinicalProtocolDecision } from './protocol-queries';

vi.mock('@/infrastructure/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));
vi.mock('@/lib/supabase/query-helpers', () => ({ logSupabaseError: vi.fn() }));
const { supabase } = await import('@/infrastructure/supabase/client');

beforeEach(() => { vi.clearAllMocks(); supabase.rpc.mockResolvedValue({ data: [], error: null }); });

describe('D2 clinical protocol decisions', () => {
  it('loads only through the guarded catalog projection', async () => {
    await listClinicalProtocols('energy');
    expect(supabase.rpc).toHaveBeenCalledWith('list_clinical_protocol_catalog', { p_domain: 'energy' });
  });
  it('records explicit professional decision and justification', async () => {
    await recordClinicalProtocolDecision({ code: 'energy.mifflin_st_jeor', version: 1, decision: 'restricted', reason: 'Usar somente após avaliação individual.' });
    expect(supabase.rpc).toHaveBeenCalledWith('accept_clinical_protocol', {
      p_code: 'energy.mifflin_st_jeor', p_version: 1, p_decision: 'restricted', p_reason: 'Usar somente após avaliação individual.',
    });
  });
  it.each([
    { code: '', version: 1, decision: 'accepted', reason: 'Justificativa válida.' },
    { code: 'energy.test', version: 0, decision: 'accepted', reason: 'Justificativa válida.' },
    { code: 'energy.test', version: 1, decision: 'unknown', reason: 'Justificativa válida.' },
    { code: 'energy.test', version: 1, decision: 'accepted', reason: 'curta' },
  ])('rejects an invalid decision before calling the RPC', async (payload) => {
    const result = await recordClinicalProtocolDecision(payload);
    expect(result.error?.message).toBe('INVALID_PROTOCOL_DECISION');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
