export const CLINICAL_ATTACHMENT_BUCKET = 'clinical-attachments';
export const CLINICAL_ATTACHMENT_MAX_FILE_SIZE = 15 * 1024 * 1024;
export const CLINICAL_ATTACHMENT_MAX_FILES_PER_BATCH = 10;
export const CLINICAL_ATTACHMENT_SIGNED_URL_TTL_SECONDS = 5 * 60;

export const CLINICAL_ATTACHMENT_ACCEPTED_MIME_TYPES = Object.freeze([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const CLINICAL_ATTACHMENT_CATEGORIES = Object.freeze([
  { code: 'laboratory_exam', label: 'Exames laboratoriais' },
  { code: 'report', label: 'Laudos e relatórios' },
  { code: 'clinical_image', label: 'Imagens clínicas' },
  { code: 'referral', label: 'Encaminhamentos' },
  { code: 'consent', label: 'Consentimentos e termos' },
  { code: 'external_prescription', label: 'Prescrições e orientações externas' },
  { code: 'patient_document', label: 'Documentos fornecidos pelo paciente' },
  { code: 'other', label: 'Outros documentos clínicos' },
]);

export const CLINICAL_ATTACHMENT_STATUS_LABELS = Object.freeze({
  uploading: 'Enviando',
  pending_review: 'Pendente de revisão',
  active: 'Ativo',
  superseded: 'Substituído',
  invalidated: 'Invalidado',
  quarantined: 'Em quarentena',
  upload_failed: 'Falha no envio',
});

export const CLINICAL_ATTACHMENT_VISIBILITY_LABELS = Object.freeze({
  professional_private: 'Privado para o profissional',
  shared_with_patient: 'Compartilhado com o paciente',
  share_later: 'Compartilhar depois',
});

export const CLINICAL_ATTACHMENT_TRANSITIONS = Object.freeze({
  uploading: Object.freeze(['pending_review', 'active', 'quarantined', 'upload_failed']),
  pending_review: Object.freeze(['active', 'invalidated', 'quarantined']),
  active: Object.freeze(['superseded', 'invalidated', 'quarantined']),
  quarantined: Object.freeze(['active', 'invalidated']),
  superseded: Object.freeze([]),
  invalidated: Object.freeze([]),
  upload_failed: Object.freeze([]),
});

const PATIENT_PROJECTION_FIELDS = Object.freeze([
  'id',
  'category_code',
  'description',
  'clinical_date',
  'source',
  'original_filename',
  'mime_type',
  'size_bytes',
  'status',
  'visibility',
  'created_at',
  'reviewed_at',
]);

export const clinicalAttachmentCategoryLabel = (code) => (
  CLINICAL_ATTACHMENT_CATEGORIES.find((category) => category.code === code)?.label
  || 'Categoria não informada'
);

export const validateClinicalAttachmentFile = (file) => {
  const errors = [];
  if (!file) return { valid: false, errors: ['file_required'] };

  if (!CLINICAL_ATTACHMENT_ACCEPTED_MIME_TYPES.includes(file.type)) {
    errors.push('unsupported_mime_type');
  }
  if (!Number.isFinite(file.size) || file.size <= 0) errors.push('invalid_file_size');
  if (file.size > CLINICAL_ATTACHMENT_MAX_FILE_SIZE) errors.push('file_too_large');

  return { valid: errors.length === 0, errors };
};

export const validateClinicalAttachmentBatch = (files) => {
  const normalizedFiles = Array.from(files || []);
  if (normalizedFiles.length === 0) {
    return { valid: false, errors: ['files_required'], fileErrors: [] };
  }

  const errors = normalizedFiles.length > CLINICAL_ATTACHMENT_MAX_FILES_PER_BATCH
    ? ['too_many_files']
    : [];
  const fileErrors = normalizedFiles.map((file) => validateClinicalAttachmentFile(file));

  return {
    valid: errors.length === 0 && fileErrors.every((result) => result.valid),
    errors,
    fileErrors,
  };
};

export const calculateClinicalAttachmentSha256 = async (
  file,
  cryptoProvider = window.crypto,
) => {
  const validation = validateClinicalAttachmentFile(file);
  if (!validation.valid) throw new Error(validation.errors[0]);
  if (typeof file.arrayBuffer !== 'function') throw new Error('file_bytes_unavailable');
  if (!cryptoProvider?.subtle?.digest) throw new Error('sha256_unavailable');

  const bytes = await file.arrayBuffer();
  const digest = await cryptoProvider.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const canTransitionClinicalAttachment = (fromStatus, toStatus) => (
  CLINICAL_ATTACHMENT_TRANSITIONS[fromStatus]?.includes(toStatus) === true
);

export const clinicalAttachmentActionRequiresReason = (action) => (
  ['invalidate', 'reject', 'replace', 'change_final_visibility'].includes(action)
);

export const normalizeClinicalAttachment = (data, { audience = 'professional' } = {}) => {
  if (!data || typeof data !== 'object') return null;

  if (audience === 'patient') {
    if (
      data.status !== 'active'
      || data.visibility !== 'shared_with_patient'
    ) return null;

    return PATIENT_PROJECTION_FIELDS.reduce((projection, field) => {
      if (data[field] !== undefined) projection[field] = data[field];
      return projection;
    }, {});
  }

  if (audience === 'patient_documents') {
    const visible = data.status === 'active' && data.visibility === 'shared_with_patient';
    const ownSubmission = data.source === 'patient'
      && ['pending_review', 'active', 'invalidated'].includes(data.status);
    if (!visible && !ownSubmission) return null;
    return {
      ...PATIENT_PROJECTION_FIELDS.reduce((projection, field) => {
        if (data[field] !== undefined) projection[field] = data[field];
        return projection;
      }, {}),
      category_label: clinicalAttachmentCategoryLabel(data.category_code),
      status_label: CLINICAL_ATTACHMENT_STATUS_LABELS[data.status] || data.status,
      can_open: data.can_open === true,
    };
  }

  return {
    ...data,
    category_label: clinicalAttachmentCategoryLabel(data.category_code),
    status_label: CLINICAL_ATTACHMENT_STATUS_LABELS[data.status] || data.status || 'Indisponível',
    visibility_label: CLINICAL_ATTACHMENT_VISIBILITY_LABELS[data.visibility]
      || data.visibility
      || 'Indisponível',
  };
};
