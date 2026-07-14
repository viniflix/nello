import { z } from 'zod';

const HTML_ENTITY_PATTERN = /&(#\d+|#x[\da-f]+|[a-z]+);/giu;
const UNICODE_WHITESPACE_PATTERN = /[\s\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u3000\ufeff]+/gu;

const decodeHtmlEntity = (entity) => {
  const normalized = entity.toLowerCase();
  const namedEntities = {
    '&amp;': '&',
    '&apos;': "'",
    '&gt;': '>',
    '&lt;': '<',
    '&nbsp;': ' ',
    '&quot;': '"',
  };

  if (namedEntities[normalized] !== undefined) return namedEntities[normalized];

  const isHex = normalized.startsWith('&#x');
  const isNumeric = isHex || normalized.startsWith('&#');
  if (!isNumeric) return entity;

  const numericValue = normalized.slice(isHex ? 3 : 2, -1);
  const codePoint = Number.parseInt(numericValue, isHex ? 16 : 10);
  if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return entity;

  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return entity;
  }
};

export const getMeaningfulClinicalText = (value) => {
  if (typeof value !== 'string') return '';

  return value
    .replace(/<[^>]*>/gu, ' ')
    .replace(HTML_ENTITY_PATTERN, decodeHtmlEntity)
    .replace(UNICODE_WHITESPACE_PATTERN, ' ')
    .trim();
};

const sectionContentSchema = z.string().optional().default('');

export const evolutionContentSchema = z
  .record(z.string(), sectionContentSchema)
  .refine(
    (content) => Object.values(content).some(
      (value) => getMeaningfulClinicalText(value).length > 0,
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
  return Object.values(content).some((value) => getMeaningfulClinicalText(value).length > 0);
};

export const getFilledSections = (content) => {
  if (!content || typeof content !== 'object') return [];
  return Object.entries(content)
    .filter(([, value]) => getMeaningfulClinicalText(value).length > 0)
    .map(([key]) => key);
};

export const getMissingSections = (content, templateSections) => {
  if (!Array.isArray(templateSections)) return [];
  return templateSections
    .filter((section) => section.required)
    .filter((section) => getMeaningfulClinicalText(content?.[section.key]).length === 0)
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
