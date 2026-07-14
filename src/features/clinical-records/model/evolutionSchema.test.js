import { describe, it, expect } from 'vitest';
import {
  evolutionContentSchema,
  retrospectiveReasonSchema,
  isContentMinimallyValid,
  getFilledSections,
  getMissingSections,
} from './evolutionSchema';

describe('evolutionContentSchema', () => {
  it('accepts content with at least one filled section', () => {
    const result = evolutionContentSchema.safeParse({
      context: 'Paciente relata...',
      conduct: '',
    });
    expect(result.success).toBe(true);
  });

  it('rejects content with only empty strings', () => {
    const result = evolutionContentSchema.safeParse({
      context: '   ',
      conduct: '',
    });
    expect(result.success).toBe(false);
    if (!result.success && result.error?.issues?.[0]) {
      expect(result.error.issues[0].message).toBe('Preencha pelo menos uma seção da evolução.');
    }
  });

  it('rejects completely empty content', () => {
    const result = evolutionContentSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('retrospectiveReasonSchema', () => {
  it('accepts reason with 10 or more chars', () => {
    expect(retrospectiveReasonSchema.safeParse('Motivo válido de atraso').success).toBe(true);
  });

  it('rejects reason with less than 10 chars', () => {
    expect(retrospectiveReasonSchema.safeParse('Curto').success).toBe(false);
  });
});

describe('isContentMinimallyValid', () => {
  it('returns true for partially filled content', () => {
    expect(isContentMinimallyValid({ context: 'teste', conduct: '' })).toBe(true);
  });

  it('returns false for empty or whitespace content', () => {
    expect(isContentMinimallyValid({})).toBe(false);
    expect(isContentMinimallyValid({ context: '  ' })).toBe(false);
    expect(isContentMinimallyValid(null)).toBe(false);
  });
});

describe('getFilledSections', () => {
  it('returns array of keys with non-empty string values', () => {
    expect(getFilledSections({
      context: 'texto',
      conduct: '  ',
      goals: 'metas',
      empty: null,
    })).toEqual(['context', 'goals']);
  });
});

describe('getMissingSections', () => {
  const template = [
    { key: 'context', label: 'Contexto', required: false },
    { key: 'conduct', label: 'Conduta', required: true },
    { key: 'goals', label: 'Metas', required: true },
  ];

  it('returns labels of missing required sections', () => {
    expect(getMissingSections({ context: 'teste', goals: '  ' }, template))
      .toEqual(['Conduta', 'Metas']);
  });

  it('returns empty array when all required sections are filled', () => {
    expect(getMissingSections({ conduct: 'ok', goals: 'ok' }, template))
      .toEqual([]);
  });
});
