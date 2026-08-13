import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDocumentArtifactFromClinicalRecord,
  finalizeDocumentArtifact,
  getMyDocumentIdentity,
  saveMyDocumentIdentity,
  signDocumentArtifact,
} from './document-queries';

vi.mock('@/infrastructure/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(),
    storage: { from: vi.fn() },
  },
}));

vi.mock('@/lib/supabase/query-helpers', () => ({ logSupabaseError: vi.fn() }));

const { supabase } = await import('@/infrastructure/supabase/client');

beforeEach(() => {
  vi.clearAllMocks();
  supabase.rpc.mockResolvedValue({ data: {}, error: null });
});

describe('document identity contracts', () => {
  it('loads the server-owned identity', async () => {
    await getMyDocumentIdentity();
    expect(supabase.rpc).toHaveBeenCalledWith('get_my_document_identity', {});
  });

  it('saves only the expected version and explicit reason', async () => {
    await saveMyDocumentIdentity({ clinic_name: 'Nello Clínica' }, 4, 'profile_update');
    expect(supabase.rpc).toHaveBeenCalledWith('save_my_document_identity', {
      p_payload: { clinic_name: 'Nello Clínica' },
      p_expected_version: 4,
      p_reason: 'profile_update',
    });
  });
});

describe('canonical document contracts', () => {
  it('creates from a server-authorized clinical source', async () => {
    await createDocumentArtifactFromClinicalRecord('record-1', 'shared_with_patient');
    expect(supabase.rpc).toHaveBeenCalledWith('create_document_artifact_from_clinical_record', {
      p_record_id: 'record-1',
      p_visibility: 'shared_with_patient',
      p_supersedes_id: null,
      p_replacement_reason: null,
    });
  });

  it('finalizes with optimistic concurrency and signs without client identity', async () => {
    await finalizeDocumentArtifact('artifact-1', 2);
    await signDocumentArtifact('artifact-1');
    expect(supabase.rpc).toHaveBeenNthCalledWith(1, 'finalize_document_artifact', {
      p_artifact_id: 'artifact-1',
      p_expected_revision: 2,
    });
    expect(supabase.rpc).toHaveBeenNthCalledWith(2, 'sign_document_artifact', {
      p_artifact_id: 'artifact-1',
    });
  });
});
