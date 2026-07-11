import { describe, expect, it } from 'vitest';
import { getHomePath, hasRequiredUserType, resolveAuthenticatedPath } from './homePath';

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

describe('hasRequiredUserType', () => {
  it('does not let admin status bypass a portal user type', () => {
    const nutritionistAdmin = { user_type: 'nutritionist', is_admin: true };
    expect(hasRequiredUserType(nutritionistAdmin, 'patient')).toBe(false);
    expect(hasRequiredUserType(nutritionistAdmin, 'nutritionist')).toBe(true);
  });

  it('allows explicit cross-role routes', () => {
    expect(hasRequiredUserType({ user_type: 'nutritionist' }, 'patient', true)).toBe(true);
  });
});

describe('resolveAuthenticatedPath', () => {
  const nutritionistAdmin = {
    profile: { user_type: 'nutritionist', is_admin: true },
  };

  it('waits for the profile before choosing a destination', () => {
    expect(resolveAuthenticatedPath({ id: 'auth-user' }, '/patient')).toBeNull();
  });

  it('does not send a nutritionist admin to the patient portal', () => {
    expect(resolveAuthenticatedPath(nutritionistAdmin, '/patient')).toBe('/nutritionist');
  });

  it('preserves a matching nutritionist destination', () => {
    expect(resolveAuthenticatedPath(nutritionistAdmin, '/nutritionist/patients')).toBe('/nutritionist/patients');
  });

  it('allows an admin destination for an admin user', () => {
    expect(resolveAuthenticatedPath(nutritionistAdmin, '/admin/dashboard')).toBe('/admin/dashboard');
  });

  it('does not send a patient to the nutritionist portal', () => {
    const patient = { profile: { user_type: 'patient', is_admin: false } };
    expect(resolveAuthenticatedPath(patient, '/nutritionist')).toBe('/patient');
  });
});
