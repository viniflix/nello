import { describe, expect, it } from 'vitest';
import {
  evolutionContentSchema,
  getFilledSections,
  getMeaningfulClinicalText,
  getMissingSections,
  isContentMinimallyValid,
  retrospectiveReasonSchema,
} from './evolutionSchema';

describe('getMeaningfulClinicalText', () => {
  it.each([
    '',
    '   ',
    '<p></p>',
    '<p>&nbsp;</p>',
    '<p>&#160;</p>',
    '<div>\u00a0\u2007\u200b\u202f\u3000</div>',
  ])('treats visually empty rich text as empty: %s', (html) => {
    expect(getMeaningfulClinicalText(html)).toBe('');
  });

  it.each([
    ['<p>Paciente relata melhora</p>', 'Paciente relata melhora'],
    ['<ul><li>Meta 1</li><li>Meta 2</li></ul>', 'Meta 1 Meta 2'],
    ['<table><tbody><tr><td>Peso</td><td>70 kg</td></tr></tbody></table>', 'Peso 70 kg'],
    ['<p>AT&amp;T</p>', 'AT&T'],
  ])('keeps meaningful paragraph, list and table text', (html, expected) => {
    expect(getMeaningfulClinicalText(html)).toBe(expected);
  });
});

describe('evolutionContentSchema', () => {
  it('accepts content with meaningful rich text', () => {
    expect(evolutionContentSchema.safeParse({ context: '<p>Paciente relata melhora</p>' }).success)
      .toBe(true);
  });

  it.each(['<p></p>', '<p>&nbsp;</p>', '<p>\u2007\u202f</p>'])(
    'rejects visually empty clinical content: %s',
    (value) => {
      expect(evolutionContentSchema.safeParse({ context: value }).success).toBe(false);
    },
  );

  it('rejects non-string section values to match the database contract', () => {
    expect(evolutionContentSchema.safeParse({ context: { type: 'doc' } }).success).toBe(false);
  });
});

describe('clinical content helpers', () => {
  it('uses the same meaningful-text rule for validity and filled sections', () => {
    const content = {
      context: '<p>&nbsp;</p>',
      conduct: '<ul><li>Orientação</li></ul>',
    };

    expect(isContentMinimallyValid(content)).toBe(true);
    expect(getFilledSections(content)).toEqual(['conduct']);
  });

  it('uses the same meaningful-text rule for required sections', () => {
    const sections = [
      { key: 'context', label: 'Contexto', required: true },
      { key: 'conduct', label: 'Conduta', required: true },
    ];

    expect(getMissingSections(
      { context: '<p>&nbsp;</p>', conduct: '<p>Orientação</p>' },
      sections,
    )).toEqual(['Contexto']);
  });
});

describe('retrospectiveReasonSchema', () => {
  it('accepts 10 through 500 characters and rejects values outside the range', () => {
    expect(retrospectiveReasonSchema.safeParse('Motivo válido').success).toBe(true);
    expect(retrospectiveReasonSchema.safeParse('Curto').success).toBe(false);
    expect(retrospectiveReasonSchema.safeParse('x'.repeat(501)).success).toBe(false);
  });
});
