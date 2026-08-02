import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createClinicalAttachmentSignedUrl,
  listClinicalAttachmentsByEpisode,
  listPatientClinicalAttachments,
} from './attachment-queries';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  createSignedUrl: vi.fn(),
  logSupabaseError: vi.fn(),
}));

vi.mock('@/infrastructure/supabase/client', () => ({
  supabase: { rpc: mocks.rpc, storage: { from: mocks.from } },
}));
vi.mock('@/lib/supabase/query-helpers', () => ({ logSupabaseError: mocks.logSupabaseError }));

const attachmentId = '50000000-0000-4000-8000-000000000101';

describe('clinical attachment read API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ createSignedUrl: mocks.createSignedUrl });
  });

  it('lists a professional episode with a stable serialized cursor', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        items: [{
          id: attachmentId,
          category_code: 'report',
          status: 'active',
          visibility: 'professional_private',
        }],
        next_cursor: JSON.stringify({ created_at: '2026-08-02T12:00:00Z', id: attachmentId }),
        has_more: true,
      },
      error: null,
    });

    const result = await listClinicalAttachmentsByEpisode('patient-1', 'episode-1', {
      status: 'active',
      cursor: { created_at: '2026-08-03T12:00:00Z', id: 'cursor-id' },
    });

    expect(mocks.rpc).toHaveBeenCalledWith('list_clinical_attachments_by_episode', {
      p_patient_id: 'patient-1',
      p_episode_id: 'episode-1',
      p_status: 'active',
      p_cursor: JSON.stringify({ created_at: '2026-08-03T12:00:00Z', id: 'cursor-id' }),
    });
    expect(result).toMatchObject({ hasMore: true, nextCursor: { id: attachmentId } });
    expect(result.items[0]).toMatchObject({
      category_label: 'Laudos e relatórios',
      status_label: 'Ativo',
    });
  });

  it('keeps only the minimized active/shared patient projection', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        items: [{
          id: attachmentId,
          patient_id: 'must-not-leak',
          storage_path: 'must-not-leak',
          sha256: 'must-not-leak',
          category_code: 'report',
          status: 'active',
          visibility: 'shared_with_patient',
          original_filename: 'laudo.pdf',
        }],
      },
      error: null,
    });

    const result = await listPatientClinicalAttachments('episode-1');

    expect(mocks.rpc).toHaveBeenCalledWith('list_patient_clinical_attachments', {
      p_care_episode_id: 'episode-1',
    });
    expect(result).toEqual([expect.objectContaining({ id: attachmentId })]);
    expect(result[0]).not.toHaveProperty('patient_id');
    expect(result[0]).not.toHaveProperty('storage_path');
    expect(result[0]).not.toHaveProperty('sha256');
  });

  it('reauthorizes and creates a five-minute URL without returning its storage path', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        attachment_id: attachmentId,
        storage_bucket: 'clinical-attachments',
        storage_path: attachmentId,
        expires_in: 300,
        authorization_expires_at: '2026-08-02T12:05:00Z',
      },
      error: null,
    });
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.test/temporary-token' },
      error: null,
    });

    const result = await createClinicalAttachmentSignedUrl(attachmentId);

    expect(mocks.rpc).toHaveBeenCalledWith('create_clinical_attachment_signed_url', {
      p_attachment_id: attachmentId,
    });
    expect(mocks.from).toHaveBeenCalledWith('clinical-attachments');
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(attachmentId, 300);
    expect(result).toEqual({
      attachmentId,
      signedUrl: 'https://storage.test/temporary-token',
      expiresAt: '2026-08-02T12:05:00Z',
    });
    expect(result).not.toHaveProperty('storagePath');
  });

  it('does not contact Storage when the authorization descriptor is malformed', async () => {
    mocks.rpc.mockResolvedValue({
      data: { attachment_id: attachmentId, storage_bucket: 'public', storage_path: attachmentId, expires_in: 3600 },
      error: null,
    });

    await expect(createClinicalAttachmentSignedUrl(attachmentId))
      .rejects.toThrow('invalid_attachment_authorization');
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it('logs and propagates authorization failures', async () => {
    const error = { code: '42501', message: 'attachment_open_forbidden' };
    mocks.rpc.mockResolvedValue({ data: null, error });

    await expect(createClinicalAttachmentSignedUrl(attachmentId)).rejects.toBe(error);
    expect(mocks.logSupabaseError).toHaveBeenCalledWith(
      'Erro ao autorizar abertura do anexo clínico',
      error,
    );
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });
});
