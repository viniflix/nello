import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  abandonClinicalRecordCorrection,
  compareClinicalRecordVersions,
  getAmendmentImpact,
  invalidateClinicalRecord,
  listClinicalRecordVersionChain,
  startClinicalRecordCorrection,
} from './amendment-queries';

vi.mock('@/infrastructure/supabase/client', () => ({
  supabase: { rpc: vi.fn() },
}));

vi.mock('@/lib/supabase/query-helpers', () => ({
  logSupabaseError: vi.fn(),
}));

const { supabase } = await import('@/infrastructure/supabase/client');
const { logSupabaseError } = await import('@/lib/supabase/query-helpers');

const FORBIDDEN_SERVER_OWNED_KEYS = [
  'p_patient_id',
  'p_episode_id',
  'p_care_episode_id',
  'p_nutritionist_id',
  'p_professional_id',
  'p_author_id',
  'p_supervisor_id',
  'p_root_record_id',
  'p_chain_version',
  'p_version',
  'p_signer_id',
];

const expectServerOwnedContextAbsent = () => {
  const payload = supabase.rpc.mock.calls.at(-1)[1];
  FORBIDDEN_SERVER_OWNED_KEYS.forEach((key) => expect(payload).not.toHaveProperty(key));
};

beforeEach(() => {
  vi.clearAllMocks();
  supabase.rpc.mockResolvedValue({ data: {}, error: null });
});

describe('clinical amendment mutation contracts', () => {
  it('starts a correction with only record, reason and impact confirmation', async () => {
    await startClinicalRecordCorrection(
      'record-1',
      'Correção factual devidamente justificada',
      { impact_hash: 'hash-1', confirmed: true },
    );

    expect(supabase.rpc).toHaveBeenCalledWith('start_clinical_record_correction', {
      p_record_id: 'record-1',
      p_reason: 'Correção factual devidamente justificada',
      p_impact_confirmation: { impact_hash: 'hash-1', confirmed: true },
    });
    expectServerOwnedContextAbsent();
  });

  it('abandons a correction with only amendment and reason', async () => {
    await abandonClinicalRecordCorrection(
      'amendment-1',
      'Rascunho aberto por engano operacional',
    );

    expect(supabase.rpc).toHaveBeenCalledWith('abandon_clinical_record_correction', {
      p_amendment_id: 'amendment-1',
      p_reason: 'Rascunho aberto por engano operacional',
    });
    expectServerOwnedContextAbsent();
  });

  it('invalidates with only record, reason and impact confirmation', async () => {
    await invalidateClinicalRecord(
      'record-1',
      'Registro atribuído ao atendimento incorreto',
      { impact_hash: 'hash-2', confirmed: true },
    );

    expect(supabase.rpc).toHaveBeenCalledWith('invalidate_clinical_record', {
      p_record_id: 'record-1',
      p_reason: 'Registro atribuído ao atendimento incorreto',
      p_impact_confirmation: { impact_hash: 'hash-2', confirmed: true },
    });
    expectServerOwnedContextAbsent();
  });
});

describe('clinical amendment read contracts', () => {
  it('loads impact and version chain using only a record identifier', async () => {
    await getAmendmentImpact('record-1');
    expect(supabase.rpc).toHaveBeenLastCalledWith(
      'get_clinical_record_amendment_impact',
      { p_record_id: 'record-1' },
    );
    expectServerOwnedContextAbsent();

    await listClinicalRecordVersionChain('record-1');
    expect(supabase.rpc).toHaveBeenLastCalledWith(
      'list_clinical_record_version_chain',
      { p_record_id: 'record-1' },
    );
    expectServerOwnedContextAbsent();
  });

  it('compares only the two explicit records', async () => {
    await compareClinicalRecordVersions('record-1', 'record-2');

    expect(supabase.rpc).toHaveBeenCalledWith('compare_clinical_record_versions', {
      p_left_record_id: 'record-1',
      p_right_record_id: 'record-2',
    });
    expectServerOwnedContextAbsent();
  });

  it('returns and safely logs RPC failures without throwing', async () => {
    const rpcError = { code: '42501', message: 'clinical_record_amendment_forbidden' };
    supabase.rpc.mockRejectedValue(rpcError);

    await expect(getAmendmentImpact('record-1')).resolves.toEqual({
      data: null,
      error: rpcError,
    });
    expect(logSupabaseError).toHaveBeenCalledWith(
      'Erro ao consultar impacto da alteração do registro clínico',
      rpcError,
    );
  });
});
