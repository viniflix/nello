import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadVerifiedFile } from '@/lib/storage/verifiedUpload';
import { FunctionsClient } from '@supabase/functions-js';
const api = vi.hoisted(() => ({ getSession: vi.fn(), rpc: vi.fn(), invoke: vi.fn() }));
vi.mock('@/infrastructure/supabase/client', () => ({ supabase: {
  supabaseUrl: 'https://project.supabase.co', auth: { getSession: api.getSession }, rpc: api.rpc,
  functions: { invoke: api.invoke },
} }));
const path = '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png';
const file = new File(['test'], 'a.png', { type: 'image/png' });
const session = { data: { session: { user: { id: 'owner' }, access_token: 'synthetic' } }, error: null };
beforeEach(() => {
  vi.clearAllMocks(); api.getSession.mockResolvedValue(session);
  api.rpc.mockResolvedValue({ data: { id: 'reservation', bucket: 'avatars', path }, error: null });
  api.invoke.mockResolvedValue({ data: { id: 'reservation', bucket: 'avatars', path, status: 'confirmed', sha256: 'a'.repeat(64), size: 4 }, error: null });
});
describe('server-owned private uploads', () => {
  it('reserves the exact scope and sends bytes only through the validating Edge', async () => {
    const result = await uploadVerifiedFile('avatars', path, file);
    expect(result.status).toBe('confirmed');
    expect(api.rpc).toHaveBeenCalledWith('reserve_storage_upload', expect.objectContaining({ p_path: path, p_size: 4, p_mime: 'image/png' }));
    expect(api.invoke).toHaveBeenCalledWith('upload-private-file', expect.objectContaining({ body: file, headers: { 'x-upload-reservation': 'reservation' } }));
  });
  it('never invokes the trusted writer after quota/scope refusal', async () => {
    api.rpc.mockResolvedValue({ data: null, error: new Error('quota') });
    await expect(uploadVerifiedFile('avatars', path, file)).rejects.toThrow('quota');
    expect(api.invoke).not.toHaveBeenCalled();
  });
  it('the installed SDK actually transmits File bytes with inferred octet-stream', async () => {
    const transport = vi.fn(async () => new Response(JSON.stringify({ status: 'confirmed', bucket: 'avatars', path, sha256: 'a'.repeat(64), size: 4 }), { headers: { 'Content-Type': 'application/json' } }));
    const sdk = new FunctionsClient('https://project.supabase.co/functions/v1', { customFetch: transport });
    api.invoke.mockImplementation((name, options) => sdk.invoke(name, options));
    await uploadVerifiedFile('avatars', path, file);
    expect(transport.mock.calls[0][1].body).toBe(file);
    expect(transport.mock.calls[0][1].headers['Content-Type']).toBe('application/octet-stream');
  });
  it('rejects an unconfirmed or differently scoped response', async () => {
    api.invoke.mockResolvedValue({ data: { status: 'processing', bucket: 'avatars', path }, error: null });
    await expect(uploadVerifiedFile('avatars', path, file)).rejects.toThrow('upload_not_verified');
  });
  it('does not bind an upload to a different signed-in session', async () => {
    api.getSession.mockResolvedValueOnce(session).mockResolvedValueOnce({ data: { session: { user: { id: 'someone-else' }, access_token: 'other' } } });
    await expect(uploadVerifiedFile('avatars', path, file)).rejects.toThrow('private_file_session_changed');
  });
  it('refuses forged paths before reservation', async () => {
    await expect(uploadVerifiedFile('avatars', '../other/file.png', file)).rejects.toThrow('invalid_upload_selection');
    expect(api.rpc).not.toHaveBeenCalled();
  });
});
