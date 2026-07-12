/* eslint-disable import/first */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, logSupabaseError } = vi.hoisted(() => ({
  rpc: vi.fn(),
  logSupabaseError: vi.fn(),
}));

vi.mock('@/infrastructure/supabase/client', () => ({ supabase: { rpc } }));
vi.mock('@/lib/supabase/query-helpers', () => ({ logSupabaseError }));

import {
  createClinicalRecordDraft,
  getPatientRecordFoundation,
  listPatientLegalGuardians,
  revokePatientLegalGuardian,
  savePatientLegalGuardian,
  updatePatientProgressiveProfile,
} from './record-foundation-queries';

describe('record foundation RPC wrappers', () => {
  beforeEach(() => {
    rpc.mockReset();
    logSupabaseError.mockReset();
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
  });

  it.each([
    ['getPatientRecordFoundation', () => getPatientRecordFoundation('patient-1'), 'get_patient_record_foundation', { p_patient_id: 'patient-1' }],
    ['updatePatientProgressiveProfile', () => updatePatientProgressiveProfile('patient-1', { name: 'Ana' }, 'nutritionist'), 'update_patient_progressive_profile', { p_patient_id: 'patient-1', p_changes: { name: 'Ana' }, p_source: 'nutritionist' }],
    ['listPatientLegalGuardians', () => listPatientLegalGuardians('patient-1', 'episode-1'), 'list_patient_legal_guardians', { p_patient_id: 'patient-1', p_episode_id: 'episode-1' }],
    ['savePatientLegalGuardian', () => savePatientLegalGuardian('patient-1', 'episode-1', { name: 'Bia' }), 'upsert_patient_legal_guardian', { p_patient_id: 'patient-1', p_episode_id: 'episode-1', p_payload: { name: 'Bia' } }],
    ['revokePatientLegalGuardian', () => revokePatientLegalGuardian('guardian-1', 'substituído'), 'revoke_patient_legal_guardian', { p_guardian_id: 'guardian-1', p_reason: 'substituído' }],
    ['createClinicalRecordDraft', () => createClinicalRecordDraft('patient-1', 'clinical_evolution', '2026-07-12T12:00:00Z', 'professional_private'), 'create_clinical_record_draft', { p_patient_id: 'patient-1', p_record_type: 'clinical_evolution', p_encounter_at: '2026-07-12T12:00:00Z', p_visibility: 'professional_private' }],
  ])('maps %s to its exact RPC payload', async (_name, call, rpcName, payload) => {
    await expect(call()).resolves.toEqual({ data: { ok: true }, error: null });
    expect(rpc).toHaveBeenCalledWith(rpcName, payload);
  });

  it('logs and returns Supabase errors without throwing', async () => {
    const error = new Error('denied');
    rpc.mockResolvedValueOnce({ data: null, error });

    await expect(getPatientRecordFoundation('patient-1')).resolves.toEqual({ data: null, error });
    expect(logSupabaseError).toHaveBeenCalledOnce();
    expect(logSupabaseError).toHaveBeenCalledWith('Erro ao buscar fundação do prontuário', error);
  });

  it('captures and logs exceptions thrown by the Supabase boundary', async () => {
    const error = new Error('network');
    rpc.mockRejectedValueOnce(error);
    await expect(getPatientRecordFoundation('patient-1')).resolves.toEqual({ data: null, error });
    expect(logSupabaseError).toHaveBeenCalledWith('Erro ao buscar fundação do prontuário', error);
  });

  it.each([
    [{ name: 'A' }],
    [{ email: 'invalid' }],
    [{ gender: 'unknown' }],
    [{ phone: 123 }],
    [null],
    [{ address: [] }],
  ])('rejects invalid progressive update %# without calling RPC', async (changes) => {
    const result = await updatePatientProgressiveProfile('patient-1', changes, 'nutritionist');
    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('validates partial updates, strips extras and sends normalized values', async () => {
    await updatePatientProgressiveProfile('patient-1', {
      email: '', phone: ' 8599 ', extra: 'discard', address: { city: ' Fortaleza ', extra: 'discard' },
    }, 'nutritionist');
    expect(rpc).toHaveBeenCalledWith('update_patient_progressive_profile', {
      p_patient_id: 'patient-1', p_source: 'nutritionist',
      p_changes: { email: null, phone: '8599', address: { city: 'Fortaleza' } },
    });
  });
});
