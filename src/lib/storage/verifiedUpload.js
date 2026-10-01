import { supabase } from '@/infrastructure/supabase/client';
import { parsePrivateFile } from './privateFiles';

/** The browser never writes object bytes directly. Retries use the same path. */
export async function uploadVerifiedFile(bucket, path, file, { chatRecipientId = null, publicToken = null, signal } = {}) {
  if (!parsePrivateFile(path, bucket) || !file?.size || !file.type) throw new Error('invalid_upload_selection');
  const before = await supabase.auth.getSession();
  if (before.error || (!publicToken && !before.data?.session?.user?.id)) throw new Error('authentication_required');
  const { data: reservation, error } = await supabase.rpc('reserve_storage_upload', {
    p_bucket: bucket, p_path: path, p_mime: file.type, p_size: file.size,
    p_chat_recipient: chatRecipientId, p_public_token: publicToken,
  });
  if (error) throw error;
  if (!reservation?.id || reservation.bucket !== bucket || reservation.path !== path) throw new Error('invalid_upload_reservation');
  // This installed FunctionsClient infers octet-stream from File/Blob. Explicit
  // Content-Type skips its body assignment; leave inference to the SDK.
  const headers = { 'x-upload-reservation': reservation.id };
  if (publicToken) headers['x-anamnesis-token'] = publicToken;
  const { data: verified, error: verificationError } = await supabase.functions.invoke('upload-private-file', { body: file, headers, signal });
  if (verificationError) throw verificationError;
  if (verified?.status !== 'confirmed' || verified.bucket !== bucket || verified.path !== path
      || !/^[0-9a-f]{64}$/.test(verified.sha256 || '') || !Number.isSafeInteger(verified.size) || verified.size < 1) throw new Error('upload_not_verified');
  const after = await supabase.auth.getSession();
  if (!publicToken && (after.error || before.data.session.user.id !== after.data?.session?.user?.id
      || before.data.session.access_token !== after.data?.session?.access_token)) throw new Error('private_file_session_changed');
  return verified;
}
