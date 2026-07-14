import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createClinicalEvolutionDraft,
  finalizeClinicalRecord,
  listClinicalRecordsByEpisode,
  listEvolutionTemplates,
  signClinicalRecord,
  updateClinicalRecordDraft,
} from './evolution-queries';

vi.mock('@/infrastructure/supabase/client', () => ({
  supabase: { rpc: vi.fn() },
}));

vi.mock('@/lib/supabase/query-helpers', () => ({
  logSupabaseError: vi.fn(),
}));

const { supabase } = await import('@/infrastructure/supabase/client');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('clinical evolution mutation contracts', () => {
  it('creates a draft using only the server-owned authorship contract', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'rec-1', revision: 1 }, error: null });

    await createClinicalEvolutionDraft(
      'patient-1',
      'episode-1',
      'soap',
      '2026-07-14T10:00:00.000Z',
      'professional_private',
      'Registro feito após atendimento',
    );

    expect(supabase.rpc).toHaveBeenCalledWith('create_clinical_evolution_draft', {
      p_patient_id: 'patient-1',
      p_episode_id: 'episode-1',
      p_template_code: 'soap',
      p_encounter_at: '2026-07-14T10:00:00.000Z',
      p_visibility: 'professional_private',
      p_retrospective_reason: 'Registro feito após atendimento',
    });
    expect(supabase.rpc.mock.calls[0][1]).not.toEqual(expect.objectContaining({
      p_nutritionist_id: expect.anything(),
      p_author_id: expect.anything(),
      p_student_id: expect.anything(),
      p_supervisor_id: expect.anything(),
    }));
  });

  it('updates a draft with the expected revision', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'rec-1', revision: 4 }, error: null });

    await updateClinicalRecordDraft(
      'rec-1',
      { conduct: '<p>Conduta</p>' },
      'shared_with_patient',
      3,
    );

    expect(supabase.rpc).toHaveBeenCalledWith('update_clinical_record_draft', {
      p_record_id: 'rec-1',
      p_content: { conduct: '<p>Conduta</p>' },
      p_visibility: 'shared_with_patient',
      p_expected_revision: 3,
    });
  });

  it('finalizes a draft with the expected revision', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'rec-1', status: 'finalized' }, error: null });

    await finalizeClinicalRecord(
      'rec-1',
      { conduct: '<p>Conduta</p>' },
      7,
      'Registro retroativo justificado',
    );

    expect(supabase.rpc).toHaveBeenCalledWith('finalize_clinical_record', {
      p_record_id: 'rec-1',
      p_content: { conduct: '<p>Conduta</p>' },
      p_expected_revision: 7,
      p_retrospective_reason: 'Registro retroativo justificado',
    });
  });

  it('signs without accepting client-owned professional identity', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'rec-1', status: 'signed' }, error: null });

    await signClinicalRecord('rec-1');

    expect(supabase.rpc).toHaveBeenCalledWith('sign_clinical_record', {
      p_record_id: 'rec-1',
    });
  });

  it('returns and logs RPC failures instead of throwing them', async () => {
    const rpcError = { message: 'draft_revision_conflict', code: '40001' };
    supabase.rpc.mockResolvedValue({ data: null, error: rpcError });

    await expect(updateClinicalRecordDraft('rec-1', {}, null, 1)).resolves.toEqual({
      data: null,
      error: rpcError,
    });
  });
});

describe('clinical evolution reads', () => {
  it('lists records for an explicit patient episode and optional status', async () => {
    supabase.rpc.mockResolvedValue({ data: [], error: null });

    await listClinicalRecordsByEpisode('patient-1', 'episode-1', 'draft');

    expect(supabase.rpc).toHaveBeenCalledWith('list_clinical_records_by_episode', {
      p_patient_id: 'patient-1',
      p_episode_id: 'episode-1',
      p_status_filter: 'draft',
    });
  });

  it('lists templates through the authenticated RPC', async () => {
    supabase.rpc.mockResolvedValue({ data: [], error: null });

    await listEvolutionTemplates();

    expect(supabase.rpc).toHaveBeenCalledWith('list_evolution_templates', {});
  });
});
