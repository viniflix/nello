import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDocumentArtifactFromClinicalRecord,
  createDocumentArtifactFromMealPlan,
  finalizeDocumentArtifact,
  getMyDocumentIdentity,
  listDocumentArtifacts,
  saveMyDocumentIdentity,
  signDocumentArtifact,
  uploadDocumentAsset,
  verifyDocumentAuthenticity,
} from './document-queries';

vi.mock('@/infrastructure/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(),
    storage: { from: vi.fn() },
    functions: { invoke: vi.fn() },
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

  it('confirms an uploaded asset through the trusted edge without sending a browser hash', async () => {
    supabase.rpc.mockResolvedValueOnce({
      data: { upload_id: 'upload-1', storage_bucket: 'document-assets', storage_path: 'owner/logo/upload-1' },
      error: null,
    });
    const upload = vi.fn().mockResolvedValue({ error: null });
    supabase.storage.from.mockReturnValue({ upload });
    supabase.functions.invoke.mockResolvedValue({ data: { success: true }, error: null });
    const file = new File(['image'], 'logo.png', { type: 'image/png' });

    const result = await uploadDocumentAsset('logo', file, 2);

    expect(result).toEqual({ data: { success: true }, error: null });
    expect(supabase.functions.invoke).toHaveBeenCalledWith('confirm-document-asset', {
      body: { uploadId: 'upload-1' },
    });
    expect(supabase.rpc).not.toHaveBeenCalledWith('confirm_document_asset_upload', expect.anything());
    expect(upload).toHaveBeenCalledWith('owner/logo/upload-1', file, expect.objectContaining({ upsert: false }));
  });
});

describe('canonical document contracts', () => {
  const patientId = '8c1a43d1-7d51-4e2f-86c5-2bd4f672d752';
  const episodeId = '75398b26-ccf8-48dc-9f17-abba1fb9db7f';

  it('lists authorized documents with and without an episode', async () => {
    await listDocumentArtifacts(patientId, episodeId);
    await listDocumentArtifacts(patientId);
    expect(supabase.rpc).toHaveBeenNthCalledWith(1, 'list_document_artifacts', {
      p_patient_id: patientId,
      p_episode_id: episodeId,
    });
    expect(supabase.rpc).toHaveBeenNthCalledWith(2, 'list_document_artifacts', {
      p_patient_id: patientId,
      p_episode_id: null,
    });
  });

  it('never calls the RPC with an omitted or malformed patient scope', async () => {
    await expect(listDocumentArtifacts(undefined, episodeId)).resolves.toMatchObject({
      error: { code: 'INVALID_DOCUMENT_SCOPE' },
    });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

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

  it('creates the official meal-plan artifact from a server-owned snapshot', async () => {
    await createDocumentArtifactFromMealPlan(42, 'shared_with_patient');
    expect(supabase.rpc).toHaveBeenCalledWith('create_document_artifact_from_meal_plan', {
      p_plan_id: 42,
      p_visibility: 'shared_with_patient',
    });
  });
});

describe('public document verification', () => {
  it('rejects malformed public codes without querying the database', async () => {
    await expect(verifyDocumentAuthenticity('not-a-uuid')).resolves.toEqual({
      data: { found: false },
      error: null,
    });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('normalizes a valid code before calling the verification RPC', async () => {
    const code = '8c1a43d1-7d51-4e2f-86c5-2bd4f672d752';
    await verifyDocumentAuthenticity(`  ${code}  `);
    expect(supabase.rpc).toHaveBeenCalledWith('verify_document_authenticity', { p_code: code });
  });
});
