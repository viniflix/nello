import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parsePrivateFile, privateFileReference, signPrivateFile } from '@/lib/storage/privateFiles';
import { validateUploadSelection, CHAT_UPLOAD_MAX_BYTES } from '@/lib/storage/uploadPolicy';
const mocked = vi.hoisted(() => ({ from: vi.fn(), createSignedUrl: vi.fn(), getSession: vi.fn() }));
vi.mock('@/infrastructure/supabase/client', () => ({ supabase: {
  supabaseUrl: 'https://project.supabase.co', storage: { from: mocked.from },
  auth: { getSession: mocked.getSession },
} }));

beforeEach(() => {
  vi.clearAllMocks();
  mocked.from.mockReturnValue({ createSignedUrl: mocked.createSignedUrl });
  mocked.getSession.mockResolvedValue({ data: { session: { user: { id: 'synthetic-user' }, access_token: 'synthetic-session' } } });
  mocked.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://project.supabase.co/storage/v1/object/sign/avatars/id/p.png?token=temporary' } });
});

describe('private object identities and access', () => {
  it('keeps a stable reference without persisting an access token', () => {
    expect(privateFileReference('avatars', 'id/p.png')).toBe('storage:avatars/id/p.png');
    expect(parsePrivateFile('storage:avatars/id/p.png')).toEqual({ bucket: 'avatars', path: 'id/p.png' });
  });
  it('reads legacy public and signed URLs only from this project', () => {
    for (const mode of ['public', 'sign', 'authenticated']) {
      expect(parsePrivateFile(`https://project.supabase.co/storage/v1/object/${mode}/avatars/id/p.png?token=old`))
        .toEqual({ bucket: 'avatars', path: 'id/p.png' });
    }
    expect(parsePrivateFile('financial-docs/id/f.pdf', 'financial-docs')).toEqual({ bucket: 'financial-docs', path: 'id/f.pdf' });
    expect(parsePrivateFile('id/f.pdf', 'financial-docs')).toEqual({ bucket: 'financial-docs', path: 'id/f.pdf' });
  });
  it.each([
    'https://attacker.test/storage/v1/object/public/avatars/id/p.png',
    'https://project.supabase.co.attacker.test/storage/v1/object/public/avatars/id/p.png',
    'https://name:password@project.supabase.co/storage/v1/object/public/avatars/id/p.png',
    'storage:financial-docs/id/f.pdf', 'storage:unknown/id/f.pdf',
    'id/../p.png', 'id/./p.png', 'id//p.png', 'id/%2e%2e/p.png',
    'id/%252e%252e/p.png', 'id/p.png?token=private', 'id/p.png#fragment', 'id\\p.png',
    'id/\u0000p.png', '/id/p.png', '',
  ])('rejects forged or ambiguous paths: %s', value => {
    expect(parsePrivateFile(value, 'avatars')).toBeNull();
  });
  it('caps all signed access at five minutes, including callers asking for a day', async () => {
    await signPrivateFile('id/p.png', 'avatars', 86400);
    expect(mocked.createSignedUrl).toHaveBeenCalledWith('id/p.png', 300);
  });
  it('does not contact Storage for a forged reference', async () => {
    await expect(signPrivateFile('storage:financial-docs/id/f.pdf', 'avatars')).rejects.toThrow();
    expect(mocked.from).not.toHaveBeenCalled();
  });
  it('discards signed access issued during a change of session', async () => {
    mocked.getSession.mockResolvedValueOnce({ data: { session: { user: { id: 'previous-user' }, access_token: 'synthetic-previous' } } });
    await expect(signPrivateFile('id/p.png', 'avatars')).rejects.toThrow('private_file_session_changed');
  });
  it('does not request signed access for an anonymous visitor', async () => {
    mocked.getSession.mockResolvedValue({ data: { session: null } });
    await expect(signPrivateFile('id/p.png', 'avatars')).rejects.toThrow('authentication_required');
    expect(mocked.from).not.toHaveBeenCalled();
  });
  it('fails closed on permission errors and foreign response origins', async () => {
    mocked.createSignedUrl.mockResolvedValueOnce({ error: new Error('forbidden') });
    await expect(signPrivateFile('id/p.png', 'avatars')).rejects.toThrow('forbidden');
    mocked.createSignedUrl.mockResolvedValueOnce({ data: { signedUrl: 'https://attacker.test/token' } });
    await expect(signPrivateFile('id/p.png', 'avatars')).rejects.toThrow('private_file_origin_mismatch');
  });
});

describe('upload selection preflight', () => {
  it('reduces future chat uploads without imposing a read limit on old files', () => {
    expect(CHAT_UPLOAD_MAX_BYTES).toBe(20 * 1024 * 1024);
    expect(() => validateUploadSelection('chat_media', { type: 'audio/webm', size: CHAT_UPLOAD_MAX_BYTES })).not.toThrow();
    expect(() => validateUploadSelection('chat_media', { type: 'video/mp4', size: CHAT_UPLOAD_MAX_BYTES + 1 })).toThrow();
  });
  it.each(['image/svg+xml', 'text/html', 'application/octet-stream', 'image/gif'])('rejects unsupported chat selection %s', type => {
    expect(() => validateUploadSelection('chat_media', { type, size: 100 })).toThrow();
  });
  it('rejects empty files and unsupported financial attachments', () => {
    expect(() => validateUploadSelection('financial-docs', { type: 'application/pdf', size: 0 })).toThrow();
    expect(() => validateUploadSelection('financial-docs', { type: 'text/html', size: 10 })).toThrow();
  });
});
