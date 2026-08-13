import { supabase } from '@/infrastructure/supabase/client';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

const callRpc = async (rpcName, payload, errorContext) => {
  try {
    const { data, error } = await supabase.rpc(rpcName, payload);
    if (error) logSupabaseError(errorContext, error);
    return { data, error };
  } catch (error) {
    logSupabaseError(errorContext, error);
    return { data: null, error };
  }
};

export const getMyDocumentIdentity = () => callRpc(
  'get_my_document_identity',
  {},
  'Erro ao carregar identidade documental',
);

export const saveMyDocumentIdentity = (payload, expectedVersion, reason = 'profile_update') => callRpc(
  'save_my_document_identity',
  {
    p_payload: payload,
    p_expected_version: expectedVersion,
    p_reason: reason,
  },
  'Erro ao salvar identidade documental',
);

const sha256 = async (file) => {
  const bytes = await file.arrayBuffer();
  const digest = await window.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const uploadDocumentAsset = async (assetType, file, expectedIdentityVersion) => {
  const intent = await callRpc(
    'create_document_asset_upload_intent',
    {
      p_asset_type: assetType,
      p_original_filename: file.name,
      p_mime_type: file.type,
      p_size_bytes: file.size,
      p_expected_identity_version: expectedIdentityVersion,
    },
    'Erro ao reservar ativo documental',
  );
  if (intent.error || !intent.data) return intent;

  const { upload_id: uploadId, storage_bucket: bucket, storage_path: path } = intent.data;
  try {
    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const hash = await sha256(file);
    return callRpc(
      'confirm_document_asset_upload',
      {
        p_upload_id: uploadId,
        p_sha256: hash,
        p_size_bytes: file.size,
        p_mime_type: file.type,
      },
      'Erro ao confirmar ativo documental',
    );
  } catch (error) {
    await callRpc(
      'fail_document_asset_upload',
      { p_upload_id: uploadId, p_failure_code: 'client_upload_failed' },
      'Erro ao registrar falha de ativo documental',
    );
    logSupabaseError('Erro ao enviar ativo documental', error);
    return { data: null, error };
  }
};

export const getMyDocumentAssetPreview = async (assetType) => {
  const projection = await callRpc(
    'get_my_document_asset_preview',
    { p_asset_type: assetType },
    'Erro ao carregar preview de ativo documental',
  );
  if (projection.error || !projection.data?.storage_path) return projection;
  const expiresIn = Math.min(Number(projection.data.expires_in) || 300, 300);
  const { data, error } = await supabase.storage
    .from(projection.data.storage_bucket)
    .createSignedUrl(projection.data.storage_path, expiresIn);
  if (error) logSupabaseError('Erro ao assinar preview de ativo documental', error);
  return { data: data ? { ...projection.data, signed_url: data.signedUrl } : null, error };
};

export const createDocumentArtifactFromClinicalRecord = (
  recordId,
  visibility,
  supersedesId = null,
  replacementReason = null,
) => callRpc(
  'create_document_artifact_from_clinical_record',
  {
    p_record_id: recordId,
    p_visibility: visibility,
    p_supersedes_id: supersedesId,
    p_replacement_reason: replacementReason,
  },
  'Erro ao criar documento clínico',
);

export const createDocumentArtifactFromMealPlan = (planId, visibility = 'shared_with_patient') => callRpc(
  'create_document_artifact_from_meal_plan',
  { p_plan_id: planId, p_visibility: visibility },
  'Erro ao criar documento do plano alimentar',
);

export const finalizeDocumentArtifact = (artifactId, expectedRevision) => callRpc(
  'finalize_document_artifact',
  { p_artifact_id: artifactId, p_expected_revision: expectedRevision },
  'Erro ao finalizar documento clínico',
);

export const signDocumentArtifact = (artifactId) => callRpc(
  'sign_document_artifact',
  { p_artifact_id: artifactId },
  'Erro ao assinar documento clínico',
);

export const getDocumentArtifact = (artifactId) => callRpc(
  'get_document_artifact',
  { p_artifact_id: artifactId },
  'Erro ao carregar documento clínico',
);

export const listDocumentArtifacts = (patientId, episodeId) => callRpc(
  'list_document_artifacts',
  { p_patient_id: patientId, p_episode_id: episodeId },
  'Erro ao listar documentos clínicos',
);

export const verifyDocumentAuthenticity = (code) => callRpc(
  'verify_document_authenticity',
  { p_code: code },
  'Erro ao verificar autenticidade documental',
);
