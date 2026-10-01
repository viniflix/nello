import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadAvatarFile } from '@/lib/storage/avatarUpload';
const api = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock('@/lib/storage/verifiedUpload', () => ({ uploadVerifiedFile: api.upload }));
vi.mock('@/infrastructure/supabase/client', () => ({ supabase: {
  supabaseUrl: 'https://project.supabase.co',
} }));

const owner = '11111111-1111-4111-8111-111111111111';
beforeEach(() => {
  vi.clearAllMocks();
  api.upload.mockResolvedValue({ status: 'confirmed' });
});
describe('immutable avatar object names', () => {
  it('never deletes the previous avatar before a replacement is saved', async () => {
    const file = new File(['synthetic'], '../../private-name.png', { type: 'image/png' });
    const reference = await uploadAvatarFile(owner, file);
    expect(reference).toMatch(new RegExp(`^storage:avatars/${owner}/[0-9a-f-]{36}\\.png$`));
    expect(reference).not.toContain('private-name');
    expect(api.upload).toHaveBeenCalledWith('avatars', expect.any(String), file);
  });
  it('propagates upload failure instead of producing a broken profile reference', async () => {
    api.upload.mockRejectedValue(new Error('network interrupted'));
    await expect(uploadAvatarFile(owner, new File(['synthetic'], 'a.png', { type: 'image/png' }))).rejects.toThrow('network interrupted');
  });
  it.each(['image/svg+xml', 'image/gif', 'text/html'])('rejects unsupported %s before upload', async type => {
    await expect(uploadAvatarFile(owner, new File(['synthetic'], 'a.png', { type }))).rejects.toThrow();
    expect(api.upload).not.toHaveBeenCalled();
  });
  it('rejects empty files and malformed owner IDs', async () => {
    await expect(uploadAvatarFile(owner, new File([], 'a.png', { type: 'image/png' }))).rejects.toThrow();
    await expect(uploadAvatarFile('../someone', new File(['x'], 'a.png', { type: 'image/png' }))).rejects.toThrow();
    expect(api.upload).not.toHaveBeenCalled();
  });
});
