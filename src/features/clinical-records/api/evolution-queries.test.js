import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  updateClinicalRecordDraft,
  finalizeClinicalRecord,
  signClinicalRecord,
  cosignClinicalRecord,
  listClinicalRecordsByEpisode,
  listEvolutionTemplates,
} from './evolution-queries';

vi.mock('@/infrastructure/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

vi.mock('@/lib/supabase/query-helpers', () => ({
  logSupabaseError: vi.fn(),
}));

const { supabase } = await import('@/infrastructure/supabase/client');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('updateClinicalRecordDraft', () => {
  it('calls RPC with correct params and returns data', async () => {
    const mockRecord = { id: 'rec-1', status: 'draft' };
    supabase.rpc.mockResolvedValue({ data: mockRecord, error: null });

    const result = await updateClinicalRecordDraft(
      'rec-1',
      { conduct: 'test' },
      'shared_with_patient',
    );

    expect(supabase.rpc).toHaveBeenCalledWith('update_clinical_record_draft', {
      p_record_id: 'rec-1',
      p_content: { conduct: 'test' },
      p_visibility: 'shared_with_patient',
    });
    expect(result.data).toEqual(mockRecord);
    expect(result.error).toBeNull();
  });

  it('passes null visibility when not provided', async () => {
    supabase.rpc.mockResolvedValue({ data: {}, error: null });
    await updateClinicalRecordDraft('rec-1', { conduct: 'test' });

    expect(supabase.rpc).toHaveBeenCalledWith('update_clinical_record_draft', {
      p_record_id: 'rec-1',
      p_content: { conduct: 'test' },
      p_visibility: null,
    });
  });

  it('returns error on RPC failure', async () => {
    const mockError = { message: 'only_draft_records_can_be_edited' };
    supabase.rpc.mockResolvedValue({ data: null, error: mockError });

    const result = await updateClinicalRecordDraft('rec-1', { conduct: 'test' });
    expect(result.error).toEqual(mockError);
    expect(result.data).toBeNull();
  });
});

describe('finalizeClinicalRecord', () => {
  it('calls RPC with content and returns finalized record', async () => {
    const mockRecord = { id: 'rec-1', status: 'finalized', canonical_hash: 'abc123' };
    supabase.rpc.mockResolvedValue({ data: mockRecord, error: null });

    const result = await finalizeClinicalRecord('rec-1', { conduct: 'Orientação final' });
    expect(supabase.rpc).toHaveBeenCalledWith('finalize_clinical_record', {
      p_record_id: 'rec-1',
      p_content: { conduct: 'Orientação final' },
      p_retrospective_reason: null,
    });
    expect(result.data.status).toBe('finalized');
  });

  it('passes retrospective reason when provided', async () => {
    supabase.rpc.mockResolvedValue({ data: {}, error: null });
    await finalizeClinicalRecord('rec-1', { conduct: 'test' }, 'Registro retroativo por esquecimento');

    expect(supabase.rpc).toHaveBeenCalledWith('finalize_clinical_record', {
      p_record_id: 'rec-1',
      p_content: { conduct: 'test' },
      p_retrospective_reason: 'Registro retroativo por esquecimento',
    });
  });
});

describe('signClinicalRecord', () => {
  it('calls sign RPC and returns signed record', async () => {
    const mockRecord = { id: 'rec-1', status: 'signed', signed_at: '2026-07-14T10:00:00Z' };
    supabase.rpc.mockResolvedValue({ data: mockRecord, error: null });

    const result = await signClinicalRecord('rec-1');
    expect(supabase.rpc).toHaveBeenCalledWith('sign_clinical_record', { p_record_id: 'rec-1' });
    expect(result.data.status).toBe('signed');
    expect(result.data.signed_at).toBeTruthy();
  });
});

describe('cosignClinicalRecord', () => {
  it('calls cosign RPC for supervisor co-signature', async () => {
    const mockRecord = { id: 'rec-1', status: 'signed' };
    supabase.rpc.mockResolvedValue({ data: mockRecord, error: null });

    const result = await cosignClinicalRecord('rec-1');
    expect(supabase.rpc).toHaveBeenCalledWith('cosign_clinical_record', { p_record_id: 'rec-1' });
    expect(result.data).toEqual(mockRecord);
  });
});

describe('listClinicalRecordsByEpisode', () => {
  it('lists records without filter', async () => {
    const mockRecords = [{ id: 'rec-1' }, { id: 'rec-2' }];
    supabase.rpc.mockResolvedValue({ data: mockRecords, error: null });

    const result = await listClinicalRecordsByEpisode('patient-1', 'episode-1');
    expect(supabase.rpc).toHaveBeenCalledWith('list_clinical_records_by_episode', {
      p_patient_id: 'patient-1',
      p_episode_id: 'episode-1',
      p_status_filter: null,
    });
    expect(result.data).toHaveLength(2);
  });

  it('passes status filter when provided', async () => {
    supabase.rpc.mockResolvedValue({ data: [], error: null });
    await listClinicalRecordsByEpisode('patient-1', 'episode-1', 'draft');

    expect(supabase.rpc).toHaveBeenCalledWith('list_clinical_records_by_episode', {
      p_patient_id: 'patient-1',
      p_episode_id: 'episode-1',
      p_status_filter: 'draft',
    });
  });
});

describe('listEvolutionTemplates', () => {
  it('lists available templates', async () => {
    const mockTemplates = [
      { code: 'nello_standard', name: 'Padrão Nello' },
      { code: 'soap', name: 'SOAP' },
    ];
    supabase.rpc.mockResolvedValue({ data: mockTemplates, error: null });

    const result = await listEvolutionTemplates();
    expect(supabase.rpc).toHaveBeenCalledWith('list_evolution_templates', {});
    expect(result.data).toHaveLength(2);
  });
});
