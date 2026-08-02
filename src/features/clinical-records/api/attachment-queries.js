import { supabase } from '@/infrastructure/supabase/client';
import { logSupabaseError } from '@/lib/supabase/query-helpers';
import {
  CLINICAL_ATTACHMENT_BUCKET,
  CLINICAL_ATTACHMENT_SIGNED_URL_TTL_SECONDS,
  normalizeClinicalAttachment,
} from '../model/attachmentSchema';

const UUID_PATH_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const throwRpcError = (context, error) => {
  logSupabaseError(context, error);
  throw error;
};

const parseCursor = (cursor) => {
  if (!cursor) return null;
  if (typeof cursor === 'string') return cursor;
  return JSON.stringify(cursor);
};

const normalizeNextCursor = (cursor) => {
  if (!cursor) return null;
  try {
    const parsed = typeof cursor === 'string' ? JSON.parse(cursor) : cursor;
    return parsed?.created_at && parsed?.id ? parsed : null;
  } catch {
    return null;
  }
};

export async function listClinicalAttachmentsByEpisode(
  patientId,
  episodeId,
  { status = null, cursor = null } = {},
) {
  const { data, error } = await supabase.rpc('list_clinical_attachments_by_episode', {
    p_patient_id: patientId,
    p_episode_id: episodeId,
    p_status: status,
    p_cursor: parseCursor(cursor),
  });
  if (error) throwRpcError('Erro ao listar anexos clínicos', error);

  return {
    items: Array.isArray(data?.items)
      ? data.items.map((item) => normalizeClinicalAttachment(item)).filter(Boolean)
      : [],
    nextCursor: normalizeNextCursor(data?.next_cursor),
    hasMore: data?.has_more === true,
  };
}

export async function listPatientClinicalAttachments(episodeId) {
  const { data, error } = await supabase.rpc('list_patient_clinical_attachments', {
    p_care_episode_id: episodeId,
  });
  if (error) throwRpcError('Erro ao listar documentos do paciente', error);

  return Array.isArray(data?.items)
    ? data.items
      .map((item) => normalizeClinicalAttachment(item, { audience: 'patient' }))
      .filter(Boolean)
    : [];
}

export async function createClinicalAttachmentSignedUrl(attachmentId) {
  const { data: authorization, error: authorizationError } = await supabase.rpc(
    'create_clinical_attachment_signed_url',
    { p_attachment_id: attachmentId },
  );
  if (authorizationError) {
    throwRpcError('Erro ao autorizar abertura do anexo clínico', authorizationError);
  }

  if (
    authorization?.attachment_id !== attachmentId
    || authorization?.storage_bucket !== CLINICAL_ATTACHMENT_BUCKET
    || authorization?.expires_in !== CLINICAL_ATTACHMENT_SIGNED_URL_TTL_SECONDS
    || !UUID_PATH_PATTERN.test(authorization?.storage_path || '')
  ) {
    throwRpcError('Resposta inválida ao autorizar anexo clínico', new Error('invalid_attachment_authorization'));
  }

  const { data, error } = await supabase.storage
    .from(authorization.storage_bucket)
    .createSignedUrl(authorization.storage_path, CLINICAL_ATTACHMENT_SIGNED_URL_TTL_SECONDS);
  if (error) throwRpcError('Erro ao criar acesso temporário ao anexo clínico', error);
  if (!data?.signedUrl) {
    throwRpcError('Resposta inválida do armazenamento clínico', new Error('signed_url_missing'));
  }

  return {
    attachmentId,
    signedUrl: data.signedUrl,
    expiresAt: authorization.authorization_expires_at,
  };
}
