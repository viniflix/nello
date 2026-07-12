/* eslint-disable import/first */
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPatientSummary: vi.fn(),
  getPatientActivities: vi.fn(),
  getPatientRecordFoundation: vi.fn(),
  listPatientLegalGuardians: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'nutritionist-1' } }) }));
vi.mock('@/lib/supabase/patient-queries', () => ({
  getPatientSummary: mocks.getPatientSummary,
  getPatientActivities: mocks.getPatientActivities,
}));
vi.mock('@/features/clinical-records/api/record-foundation-queries', () => ({
  getPatientRecordFoundation: mocks.getPatientRecordFoundation,
  listPatientLegalGuardians: mocks.listPatientLegalGuardians,
}));

import { usePatientHub } from './usePatientHub';

describe('usePatientHub clinical record foundation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPatientSummary.mockResolvedValue({
      data: { profile: { name: 'Ana', birth_date: '2012-01-01', care_episode_id: 'episode-1' }, metrics: {}, modulesStatus: {} },
      error: null,
    });
    mocks.getPatientActivities.mockResolvedValue({ data: [], error: null });
    mocks.getPatientRecordFoundation.mockResolvedValue({
      data: { patient: { name: 'Ana', birth_date: '2012-01-01' }, records: [] },
      error: null,
    });
    mocks.listPatientLegalGuardians.mockResolvedValue({ data: [{ id: 'guardian-1', status: 'active' }], error: null });
  });

  it('loads foundation and guardians alongside the existing summary', async () => {
    const { result } = renderHook(() => usePatientHub('patient-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.foundation.patient.name).toBe('Ana');
    expect(result.current.legalGuardians).toEqual([{ id: 'guardian-1', status: 'active' }]);
    expect(result.current.profileRequirements).toEqual([]);
    expect(mocks.getPatientSummary).toHaveBeenCalledWith('patient-1', 'nutritionist-1');
    expect(mocks.getPatientRecordFoundation).toHaveBeenCalledWith('patient-1');
    expect(mocks.listPatientLegalGuardians).toHaveBeenCalledWith('patient-1', 'episode-1');
  });

  it('preserves summary fallbacks and empty states when foundation fails', async () => {
    mocks.getPatientRecordFoundation.mockResolvedValue({ data: null, error: new Error('unavailable') });
    const { result } = renderHook(() => usePatientHub('patient-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.patientData.name).toBe('Ana');
    expect(result.current.foundation).toBeNull();
    expect(result.current.legalGuardians).toEqual([{ id: 'guardian-1', status: 'active' }]);
    expect(mocks.listPatientLegalGuardians).toHaveBeenCalledWith('patient-1', 'episode-1');
  });
});
