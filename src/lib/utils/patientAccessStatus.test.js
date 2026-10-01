import { describe, expect, it } from 'vitest';
import { isPatientAccessPending } from './patientAccessStatus';

describe('patient account activation', () => {
  it('keeps confirmed birthday-password accounts active with optional reminder', () => {
    expect(isPatientAccessPending({ access_status: 'ready', needs_password_reset: true })).toBe(false);
    expect(isPatientAccessPending({ needs_password_reset: true })).toBe(false);
  });
  it('distinguishes real offline and email confirmation invitations', () => {
    expect(isPatientAccessPending({ access_status: 'offline' })).toBe(true);
    expect(isPatientAccessPending({ access_status: 'awaiting_email_confirmation' })).toBe(true);
    expect(isPatientAccessPending({ patient_invite_code: 'synthetic' })).toBe(true);
    expect(isPatientAccessPending({ access_status: 'ready', patient_invite_code: 'obsolete' })).toBe(false);
  });
  it('does not count archived accounts as pending activation', () => {
    expect(isPatientAccessPending({ is_active: false, access_status: 'offline' })).toBe(false);
    expect(isPatientAccessPending({ arquivadoHistorico: true, access_status: 'awaiting_email_confirmation' })).toBe(false);
  });
});
