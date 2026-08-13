import { supabase } from '@/infrastructure/supabase/client';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

export async function getMyDataExportSnapshot() {
  const { data, error } = await supabase.rpc('build_my_data_export_snapshot');
  if (error) logSupabaseError('Erro ao preparar portabilidade de dados', error);
  return { data, error };
}

export async function getDataExportAttachmentUrl(attachmentId) {
  const { data: authorization, error: authorizationError } = await supabase.rpc(
    'authorize_my_data_export_attachment',
    { p_attachment_id: attachmentId },
  );
  if (authorizationError) throw authorizationError;
  if (
    authorization?.attachment_id !== attachmentId
    || authorization?.expires_in !== 300
    || !authorization?.storage_bucket
    || !authorization?.storage_path
  ) throw new Error('invalid_data_export_attachment_authorization');

  const { data, error } = await supabase.storage
    .from(authorization.storage_bucket)
    .createSignedUrl(authorization.storage_path, 300);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error('data_export_signed_url_missing');
  return data.signedUrl;
}
