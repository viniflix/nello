import { z } from 'zod';

const sectionContentSchema = z.string().or(z.object({})).optional().default('');

export const evolutionContentSchema = z
  .record(z.string(), sectionContentSchema)
  .refine(
    (content) =>
      Object.values(content).some(
        (value) => typeof value === 'string' && value.trim().length > 0,
      ),
    { message: 'Preencha pelo menos uma seção da evolução.' },
  );

export const retrospectiveReasonSchema = z
  .string()
  .min(10, 'Descreva o motivo do registro retroativo (mínimo 10 caracteres).')
  .max(500, 'O motivo não pode exceder 500 caracteres.');

export const visibilitySchema = z.enum([
  'professional_private',
  'shared_with_patient',
  'share_later',
]);

export const isContentMinimallyValid = (content) => {
  if (!content || typeof content !== 'object') return false;
  return Object.values(content).some(
    (value) => typeof value === 'string' && value.trim().length > 0,
  );
};

export const getFilledSections = (content) => {
  if (!content || typeof content !== 'object') return [];
  return Object.entries(content)
    .filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
    .map(([key]) => key);
};

export const getMissingSections = (content, templateSections) => {
  if (!templateSections || !Array.isArray(templateSections)) return [];
  return templateSections
    .filter((section) => section.required)
    .filter((section) => {
      const value = content?.[section.key];
      return !value || (typeof value === 'string' && value.trim().length === 0);
    })
    .map((section) => section.label);
};

export const RECORD_STATUS_LABELS = {
  draft: 'Rascunho',
  finalized: 'Finalizado',
  signed: 'Assinado',
  corrected: 'Corrigido',
  invalidated: 'Invalidado',
};

export const RECORD_STATUS_COLORS = {
  draft: 'yellow',
  finalized: 'blue',
  signed: 'green',
  corrected: 'orange',
  invalidated: 'red',
};
