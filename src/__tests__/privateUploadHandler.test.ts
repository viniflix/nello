// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { processPrivateUpload } from '../../supabase/functions/upload-private-file/handler';
import { cleanExpiredUploads } from '../../supabase/functions/upload-private-file/cleanup';
vi.mock('../../supabase/functions/upload-private-file/imageSanitizer', () => ({ sanitizeImage: vi.fn(async bytes => bytes) }));
vi.mock('../../supabase/functions/upload-private-file/pdfValidation', () => ({ validatePdf: vi.fn(async bytes => bytes) }));
const reservation = { id: 'r', bucket: 'avatars', path: 'owner/new.png', status: 'processing', size: 4, mime: 'image/png' };
const upload = vi.fn(); const remove = vi.fn(); const rpc = vi.fn(); const initializeImages = vi.fn();
const admin = { storage: { from: vi.fn(() => ({ upload, remove })) }, rpc };
const request = () => new Request('https://example.invalid', { method: 'POST', body: new Uint8Array([1, 2, 3, 4]) });
beforeEach(() => { vi.clearAllMocks(); upload.mockResolvedValue({ error: null }); remove.mockResolvedValue({ error: null }); rpc.mockResolvedValue({ data: { status: 'confirmed' }, error: null }); });
describe('trusted validation-to-storage boundary', () => {
  it('hashes bytes on server and forbids overwrite', async () => {
    expect((await processPrivateUpload(request(), { reservation, admin, initializeImages })).status).toBe(200);
    expect(upload).toHaveBeenCalledWith(reservation.path, expect.any(Uint8Array), expect.objectContaining({ upsert: false }));
    expect(rpc).toHaveBeenCalledWith('finish_storage_upload', expect.objectContaining({ p_size: 4, p_sha256: expect.stringMatching(/^[0-9a-f]{64}$/), p_source_sha256: expect.stringMatching(/^[0-9a-f]{64}$/) }));
  });
  it('never removes someone else’s existing object on overwrite/storage failure', async () => {
    upload.mockResolvedValue({ error: new Error('duplicate') });
    await expect(processPrivateUpload(request(), { reservation, admin, initializeImages })).rejects.toThrow('storage_upload_failed');
    expect(remove).not.toHaveBeenCalled();
  });
  it('compensates only its own uploaded object if confirmation fails', async () => {
    rpc.mockResolvedValueOnce({ error: new Error('confirmation') }).mockResolvedValueOnce({ data: true, error: null });
    await expect(processPrivateUpload(request(), { reservation, admin, initializeImages })).rejects.toThrow('upload_confirmation_failed');
    expect(remove).toHaveBeenCalledWith([reservation.path]);
  });
  it('preserves bytes when a lost confirmation response may have committed', async () => {
    rpc.mockResolvedValueOnce({ error: new Error('lost response') }).mockResolvedValueOnce({ data: false, error: null });
    await expect(processPrivateUpload(request(), { reservation, admin, initializeImages })).rejects.toThrow('upload_confirmation_failed');
    expect(remove).not.toHaveBeenCalled();
  });
  it('rejects declared size mismatch before storage', async () => {
    await expect(processPrivateUpload(request(), { reservation: { ...reservation, size: 3 }, admin, initializeImages })).rejects.toThrow('upload_size_mismatch');
    expect(upload).not.toHaveBeenCalled();
  });
  it('does not approve media on a magic-byte signature alone', async () => {
    await expect(processPrivateUpload(request(), { reservation: { ...reservation, mime: 'video/mp4' }, admin, initializeImages })).rejects.toThrow('uploaded_content_invalid');
    expect(upload).not.toHaveBeenCalled();
  });
  it('cleanup marks ledger deleted only after Storage confirms byte deletion', async () => {
    rpc.mockResolvedValueOnce({ data: [{ id: 'r', bucket_id: 'avatars', object_path: 'owner/new.png' }] }).mockResolvedValueOnce({ error: null });
    expect(await cleanExpiredUploads(admin)).toEqual({ claimed: 1, removed: 1 });
    expect(remove).toHaveBeenCalledWith(['owner/new.png']);
    expect(rpc).toHaveBeenLastCalledWith('finish_expired_storage_upload_cleanup', { p_reservation_id: 'r' });
  });
});
