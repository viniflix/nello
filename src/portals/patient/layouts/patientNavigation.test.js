import { describe, expect, it } from 'vitest';
import { isPatientNavItemActive, PATIENT_NAV_ITEMS } from './patientNavigation';

describe('patientNavigation', () => {
  it('offers exactly five primary destinations and keeps clinical records inside Progress', () => {
    expect(PATIENT_NAV_ITEMS.map((item) => item.label)).toEqual([
      'Início', 'Plano', 'Progresso', 'Chat', 'Perfil',
    ]);
    expect(PATIENT_NAV_ITEMS).toHaveLength(5);
    expect(PATIENT_NAV_ITEMS.some((item) => item.to === '/patient/registros-clinicos')).toBe(false);
  });

  it('keeps Progresso selected on the compatible clinical-records route', () => {
    const progressItem = PATIENT_NAV_ITEMS.find((item) => item.label === 'Progresso');
    expect(isPatientNavItemActive(progressItem, '/patient/registros-clinicos')).toBe(true);
    expect(isPatientNavItemActive(progressItem, '/patient/chat')).toBe(false);
  });
});
