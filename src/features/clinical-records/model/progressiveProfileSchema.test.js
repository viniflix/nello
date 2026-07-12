import { describe, expect, it } from 'vitest';
import {
  getContextualProfileRequirements,
  normalizeProgressiveProfilePayload,
  progressiveProfileSchema,
} from './progressiveProfileSchema';

describe('progressiveProfileSchema', () => {
  it('requires a trimmed name with at least two characters', () => {
    expect(progressiveProfileSchema.safeParse({ name: ' A ' }).success).toBe(false);
    expect(progressiveProfileSchema.parse({ name: '  Ana  ' }).name).toBe('Ana');
  });

  it('accepts empty optional fields and rejects invalid populated email and gender', () => {
    expect(progressiveProfileSchema.safeParse({ name: 'Ana', email: '', gender: '' }).success).toBe(true);
    expect(progressiveProfileSchema.safeParse({ name: 'Ana', email: 'x', gender: 'unknown' }).success).toBe(false);
  });

  it('normalizes sent empty strings to null while preserving an explicit address', () => {
    expect(normalizeProgressiveProfilePayload({
      name: '  Ana  ', phone: ' ', email: '', birth_date: '', occupation: '',
      address: { street: '', city: ' Fortaleza ', state: '', postal_code: ' ' },
    })).toEqual({
      name: 'Ana', phone: null, email: null, birth_date: null, occupation: null,
      address: { street: null, city: 'Fortaleza', state: null, postal_code: null },
    });
  });

  it('does not add optional keys that were not sent', () => {
    expect(normalizeProgressiveProfilePayload({ name: 'Ana' })).toEqual({ name: 'Ana' });
  });
});

describe('getContextualProfileRequirements', () => {
  it('requires birth date for age-based protocols without making unrelated fields mandatory', () => {
    expect(getContextualProfileRequirements({ name: 'Ana' }, { ageBasedProtocol: true })).toEqual(['birth_date']);
  });

  it('requires birth date and an active legal guardian for a minor', () => {
    expect(getContextualProfileRequirements(
      { name: 'Ana', birth_date: '2012-01-01' },
      { isMinor: true, legalGuardians: [] },
    )).toEqual(['legal_guardian']);
  });

  it('returns deterministic requirements and recognizes an active guardian', () => {
    expect(getContextualProfileRequirements(
      { name: 'Ana' },
      { isMinor: true, ageBasedProtocol: true, legalGuardians: [{ status: 'active' }] },
    )).toEqual(['birth_date']);
  });
});
