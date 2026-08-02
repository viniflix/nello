import { supabase } from '@/infrastructure/supabase/client';
import { logSupabaseError } from '@/lib/supabase/query-helpers';
import {
  CLINICAL_ATTACHMENT_BUCKET,
  CLINICAL_ATTACHMENT_SIGNED_URL_TTL_SECONDS,
  calculateClinicalAttachmentSha256,
  validateClinicalAttachmentFile,
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

export async function uploadClinicalAttachment({
  patientId,
  episodeId,
  clinicalRecordId = null,
  categoryCode,
  description = null,
  clinicalDate = null,
  file,
}) {
  const validation = validateClinicalAttachmentFile(file);
  if (!validation.valid) throw new Error(validation.errors[0]);

  const sha256 = await calculateClinicalAttachmentSha256(file);
  const { data: intent, error: intentError } = await supabase.rpc(
    'create_clinical_attachment_upload_intent',
    {
      p_patient_id: patientId,
      p_care_episode_id: episodeId,
      p_clinical_record_id: clinicalRecordId,
      p_category_code: categoryCode,
      p_description: description,
      p_clinical_date: clinicalDate,
      p_original_filename: file.name,
      p_mime_type: file.type,
      p_size_bytes: file.size,
    },
  );
  if (intentError) throwRpcError('Erro ao reservar envio do anexo clínico', intentError);

  const validIntent = intent?.storage_bucket === CLINICAL_ATTACHMENT_BUCKET
    && UUID_PATH_PATTERN.test(intent?.storage_path || '')
    && intent?.attachment_id === intent?.storage_path;
  if (!validIntent) throwRpcError('Reserva inválida de anexo clínico', new Error('invalid_upload_intent'));

  const { error: uploadError } = await supabase.storage
    .from(CLINICAL_ATTACHMENT_BUCKET)
    .upload(intent.storage_path, file, { upsert: false, contentType: file.type });
  if (uploadError) {
    await supabase.rpc('fail_clinical_attachment_upload', {
      p_attachment_id: intent.attachment_id,
      p_reason: 'storage_upload_failed',
    });
    throwRpcError('Erro ao enviar anexo clínico', uploadError);
  }

  const { data, error } = await supabase.rpc('confirm_clinical_attachment_upload', {
    p_attachment_id: intent.attachment_id,
    p_sha256: sha256,
    p_size_bytes: file.size,
    p_mime_type: file.type,
  });
  if (error) throwRpcError('Erro ao confirmar anexo clínico', error);
  return data;
}

export async function reviewPatientClinicalAttachment(attachmentId, {
  decision,
  reason = null,
  categoryCode = null,
  description = null,
  clinicalDate = null,
  clinicalRecordId = null,
}) {
  const { data, error } = await supabase.rpc('review_patient_clinical_attachment', {
    p_attachment_id: attachmentId,
    p_decision: decision,
    p_reason: reason,
    p_category_code: categoryCode,
    p_description: description,
    p_clinical_date: clinicalDate,
    p_clinical_record_id: clinicalRecordId,
  });
  if (error) throwRpcError('Erro ao revisar documento do paciente', error);
  return data;
}

export async function changeClinicalAttachmentVisibility(attachmentId, visibility, reason) {
  const { data, error } = await supabase.rpc('change_clinical_attachment_visibility', {
    p_attachment_id: attachmentId,
    p_visibility: visibility,
    p_reason: reason,
  });
  if (error) throwRpcError('Erro ao alterar compartilhamento do anexo', error);
  return data;
}

export async function invalidateClinicalAttachment(attachmentId, reason) {
  const { data, error } = await supabase.rpc('invalidate_clinical_attachment', {
    p_attachment_id: attachmentId,
    p_reason: reason,
  });
  if (error) throwRpcError('Erro ao invalidar anexo clínico', error);
  return data;
}

export async function getMyClinicalDocumentContext() {
  const { data, error } = await supabase.rpc('get_my_clinical_document_context');
  if (error) throwRpcError('Erro ao localizar atendimento para documentos', error);
  return data || {};
}

export async function listMyClinicalDocuments(episodeId) {
  const { data, error } = await supabase.rpc('list_my_clinical_documents', {
    p_care_episode_id: episodeId,
  });
  if (error) throwRpcError('Erro ao listar seus documentos clínicos', error);
  return Array.isArray(data?.items)
    ? data.items
      .map((item) => normalizeClinicalAttachment(item, { audience: 'patient_documents' }))
      .filter(Boolean)
    : [];
}
