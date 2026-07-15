import { describe, expect, it } from 'vitest';
import {
  CLINICAL_ATTACHMENT_ACCEPTED_MIME_TYPES,
  CLINICAL_ATTACHMENT_CATEGORIES,
  CLINICAL_ATTACHMENT_MAX_FILE_SIZE,
  CLINICAL_ATTACHMENT_MAX_FILES_PER_BATCH,
  CLINICAL_ATTACHMENT_SIGNED_URL_TTL_SECONDS,
  canTransitionClinicalAttachment,
  clinicalAttachmentActionRequiresReason,
  clinicalAttachmentCategoryLabel,
  normalizeClinicalAttachment,
  validateClinicalAttachmentBatch,
  validateClinicalAttachmentFile,
} from './attachmentSchema';

const file = (overrides = {}) => ({
  name: 'exame.pdf',
  type: 'application/pdf',
  size: 1024,
  ...overrides,
});

describe('clinical attachment contracts', () => {
  it('defines stable MVP categories and short-lived signed URLs', () => {
    expect(CLINICAL_ATTACHMENT_CATEGORIES.map(({ code }) => code)).toEqual([
      'laboratory_exam',
      'report',
      'clinical_image',
      'referral',
      'consent',
      'external_prescription',
      'patient_document',
      'other',
    ]);
    expect(clinicalAttachmentCategoryLabel('laboratory_exam')).toBe('Exames laboratoriais');
    expect(clinicalAttachmentCategoryLabel('unknown')).toBe('Categoria não informada');
    expect(CLINICAL_ATTACHMENT_SIGNED_URL_TTL_SECONDS).toBe(300);
  });

  it.each(CLINICAL_ATTACHMENT_ACCEPTED_MIME_TYPES)('accepts %s', (type) => {
    expect(validateClinicalAttachmentFile(file({ type }))).toEqual({ valid: true, errors: [] });
  });

  it('rejects unsupported, empty and oversized files with stable codes', () => {
    expect(validateClinicalAttachmentFile(file({ type: 'text/html' }))).toEqual({
      valid: false,
      errors: ['unsupported_mime_type'],
    });
    expect(validateClinicalAttachmentFile(file({ size: 0 }))).toEqual({
      valid: false,
      errors: ['invalid_file_size'],
    });
    expect(validateClinicalAttachmentFile(file({ size: CLINICAL_ATTACHMENT_MAX_FILE_SIZE + 1 })))
      .toEqual({ valid: false, errors: ['file_too_large'] });
  });

  it('enforces the upload batch limit and reports per-file errors', () => {
    expect(validateClinicalAttachmentBatch([])).toEqual({
      valid: false,
      errors: ['files_required'],
      fileErrors: [],
    });

    const oversizedBatch = Array.from(
      { length: CLINICAL_ATTACHMENT_MAX_FILES_PER_BATCH + 1 },
      (_, index) => file({ name: `exame-${index}.pdf` }),
    );
    expect(validateClinicalAttachmentBatch(oversizedBatch)).toMatchObject({
      valid: false,
      errors: ['too_many_files'],
    });

    expect(validateClinicalAttachmentBatch([file(), file({ type: 'image/svg+xml' })]))
      .toMatchObject({
        valid: false,
        errors: [],
        fileErrors: [
          { valid: true, errors: [] },
          { valid: false, errors: ['unsupported_mime_type'] },
        ],
      });
  });

  it('allows only explicit lifecycle transitions', () => {
    expect(canTransitionClinicalAttachment('uploading', 'active')).toBe(true);
    expect(canTransitionClinicalAttachment('pending_review', 'active')).toBe(true);
    expect(canTransitionClinicalAttachment('active', 'superseded')).toBe(true);
    expect(canTransitionClinicalAttachment('invalidated', 'active')).toBe(false);
    expect(canTransitionClinicalAttachment('active', 'uploading')).toBe(false);
    expect(canTransitionClinicalAttachment('unknown', 'active')).toBe(false);
  });

  it.each(['invalidate', 'reject', 'replace', 'change_final_visibility'])(
    'requires a reason for %s',
    (action) => expect(clinicalAttachmentActionRequiresReason(action)).toBe(true),
  );

  it('minimizes the patient projection and hides non-shared records', () => {
    const internal = {
      id: 'attachment-1',
      patient_id: 'patient-1',
      care_episode_id: 'episode-1',
      clinical_record_id: 'record-1',
      author_id: 'nutritionist-1',
      reviewed_by: 'nutritionist-1',
      category_code: 'report',
      description: 'Laudo recebido',
      clinical_date: '2026-07-15',
      source: 'nutritionist',
      original_filename: 'laudo.pdf',
      mime_type: 'application/pdf',
      size_bytes: 1024,
      status: 'active',
      visibility: 'shared_with_patient',
      storage_bucket: 'clinical-attachments',
      storage_path: 'secret/path',
      sha256: 'secret-hash',
      created_at: '2026-07-15T12:00:00Z',
      reviewed_at: '2026-07-15T12:05:00Z',
      invalidation_reason: null,
    };

    expect(normalizeClinicalAttachment(internal, { audience: 'patient' })).toEqual({
      id: 'attachment-1',
      category_code: 'report',
      description: 'Laudo recebido',
      clinical_date: '2026-07-15',
      source: 'nutritionist',
      original_filename: 'laudo.pdf',
      mime_type: 'application/pdf',
      size_bytes: 1024,
      status: 'active',
      visibility: 'shared_with_patient',
      created_at: '2026-07-15T12:00:00Z',
      reviewed_at: '2026-07-15T12:05:00Z',
    });
    expect(normalizeClinicalAttachment({
      ...internal,
      visibility: 'professional_private',
    }, { audience: 'patient' })).toBeNull();
    expect(normalizeClinicalAttachment({
      ...internal,
      status: 'pending_review',
    }, { audience: 'patient' })).toBeNull();
  });
});

