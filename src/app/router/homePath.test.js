import { describe, expect, it } from 'vitest';
import { getHomePath } from './homePath';

describe('getHomePath', () => {
  it('routes anonymous and incomplete users to login', () => {
    expect(getHomePath()).toBe('/login');
    expect(getHomePath({})).toBe('/login');
  });

  it('routes nutritionists to the nutritionist portal', () => {
    expect(getHomePath({ profile: { user_type: 'nutritionist' } })).toBe('/nutritionist');
  });

  it('routes patients to the patient portal', () => {
    expect(getHomePath({ profile: { user_type: 'patient' } })).toBe('/patient');
  });
});
