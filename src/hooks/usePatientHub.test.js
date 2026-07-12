/* eslint-disable import/first */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, StrictMode } from 'react';

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

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

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

  it('surfaces summary errors and clears clinical state', async () => {
    const error = new Error('summary denied');
    mocks.getPatientSummary.mockResolvedValue({ data: null, error });
    const { result } = renderHook(() => usePatientHub('patient-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(error);
    expect(result.current.patientData).toBeNull();
    expect(result.current.foundation).toBeNull();
  });

  it('reports a not-found summary', async () => {
    mocks.getPatientSummary.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => usePatientHub('patient-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error?.message).toContain('Paciente');
  });

  it('keeps guardians empty on guardian error and when no episode exists', async () => {
    mocks.listPatientLegalGuardians.mockResolvedValue({ data: null, error: new Error('denied') });
    const first = renderHook(() => usePatientHub('patient-1'));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(first.result.current.legalGuardians).toEqual([]);
    first.unmount();

    mocks.getPatientSummary.mockResolvedValue({ data: { profile: { name: 'Ana' }, metrics: {}, modulesStatus: {} }, error: null });
    mocks.getPatientRecordFoundation.mockResolvedValue({ data: { patient: { name: 'Ana' }, records: [] }, error: null });
    mocks.listPatientLegalGuardians.mockClear();
    const second = renderHook(() => usePatientHub('patient-2'));
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(mocks.listPatientLegalGuardians).not.toHaveBeenCalled();
    expect(second.result.current.legalGuardians).toEqual([]);
  });

  it('refreshes summary, foundation and activities', async () => {
    const { result } = renderHook(() => usePatientHub('patient-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.refresh());
    expect(mocks.getPatientSummary).toHaveBeenCalledTimes(2);
    expect(mocks.getPatientRecordFoundation).toHaveBeenCalledTimes(2);
    expect(mocks.getPatientActivities).toHaveBeenCalled();
  });

  it('prevents an older patient request from overwriting the latest patient', async () => {
    const summaryA = deferred();
    const foundationA = deferred();
    mocks.getPatientSummary
      .mockReturnValueOnce(summaryA.promise)
      .mockResolvedValueOnce({ data: { profile: { name: 'B' }, metrics: {}, modulesStatus: {} }, error: null });
    mocks.getPatientRecordFoundation
      .mockReturnValueOnce(foundationA.promise)
      .mockResolvedValueOnce({ data: { patient: { name: 'B' }, records: [] }, error: null });

    const { result, rerender } = renderHook(({ patientId }) => usePatientHub(patientId), {
      initialProps: { patientId: 'patient-a' },
    });
    rerender({ patientId: 'patient-b' });
    await waitFor(() => expect(result.current.patientData?.name).toBe('B'));
    await act(async () => {
      summaryA.resolve({ data: { profile: { name: 'A' }, metrics: {}, modulesStatus: {} }, error: null });
      foundationA.resolve({ data: { patient: { name: 'A' }, records: [] }, error: null });
      await Promise.all([summaryA.promise, foundationA.promise]);
    });
    expect(result.current.patientData.name).toBe('B');
    expect(result.current.foundation.patient.name).toBe('B');
  });

  it('does not continue the request chain after unmount', async () => {
    const summary = deferred();
    const foundation = deferred();
    mocks.getPatientSummary.mockReturnValue(summary.promise);
    mocks.getPatientRecordFoundation.mockReturnValue(foundation.promise);
    const { unmount } = renderHook(() => usePatientHub('patient-1'));
    unmount();
    await act(async () => {
      summary.resolve({ data: { profile: { care_episode_id: 'episode-1' }, metrics: {}, modulesStatus: {} }, error: null });
      foundation.resolve({ data: { patient: {}, records: [] }, error: null });
      await Promise.all([summary.promise, foundation.promise]);
    });
    expect(mocks.listPatientLegalGuardians).not.toHaveBeenCalled();
  });

  it('ignores guardians from an older patient after the latest patient finishes', async () => {
    const guardiansA = deferred();
    mocks.getPatientSummary
      .mockResolvedValueOnce({ data: { profile: { name: 'A', care_episode_id: 'episode-a' }, metrics: {}, modulesStatus: {} }, error: null })
      .mockResolvedValueOnce({ data: { profile: { name: 'B', care_episode_id: 'episode-b' }, metrics: {}, modulesStatus: {} }, error: null });
    mocks.getPatientRecordFoundation
      .mockResolvedValueOnce({ data: { patient: { name: 'A' }, records: [] }, error: null })
      .mockResolvedValueOnce({ data: { patient: { name: 'B' }, records: [] }, error: null });
    mocks.listPatientLegalGuardians
      .mockReturnValueOnce(guardiansA.promise)
      .mockResolvedValueOnce({ data: [{ id: 'guardian-b', status: 'active' }], error: null });
    const { result, rerender } = renderHook(({ patientId }) => usePatientHub(patientId), {
      initialProps: { patientId: 'patient-a' },
    });
    await waitFor(() => expect(mocks.listPatientLegalGuardians).toHaveBeenCalledWith('patient-a', 'episode-a'));
    rerender({ patientId: 'patient-b' });
    await waitFor(() => expect(result.current.legalGuardians).toEqual([{ id: 'guardian-b', status: 'active' }]));
    await act(async () => {
      guardiansA.resolve({ data: [{ id: 'guardian-a', status: 'active' }], error: null });
      await guardiansA.promise;
    });
    expect(result.current.patientData.name).toBe('B');
    expect(result.current.legalGuardians).toEqual([{ id: 'guardian-b', status: 'active' }]);
    expect(result.current.loading).toBe(false);
  });

  it('reports a legal guardian requirement for a minor without an active guardian', async () => {
    mocks.listPatientLegalGuardians.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => usePatientHub('patient-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profileRequirements).toEqual(['legal_guardian']);
  });

  it('clears the previous patient snapshot immediately when patientId changes', async () => {
    const summaryB = deferred();
    const foundationB = deferred();
    mocks.getPatientSummary
      .mockResolvedValueOnce({ data: { profile: { name: 'A' }, metrics: { weight: 70 }, modulesStatus: { plan: true } }, error: null })
      .mockReturnValueOnce(summaryB.promise);
    mocks.getPatientRecordFoundation
      .mockResolvedValueOnce({ data: { patient: { name: 'A' }, records: [] }, error: null })
      .mockReturnValueOnce(foundationB.promise);
    mocks.getPatientActivities.mockResolvedValueOnce({ data: [{ id: 'activity-a' }], error: null });
    const { result, rerender } = renderHook(({ patientId }) => usePatientHub(patientId), { initialProps: { patientId: 'a' } });
    await waitFor(() => expect(result.current.patientData?.name).toBe('A'));
    await waitFor(() => expect(result.current.activities).toEqual([{ id: 'activity-a' }]));
    rerender({ patientId: 'b' });
    expect(result.current.loading).toBe(true);
    expect(result.current.patientData).toBeNull();
    expect(result.current.foundation).toBeNull();
    expect(result.current.legalGuardians).toEqual([]);
    expect(result.current.profileRequirements).toEqual([]);
    expect(result.current.activities).toEqual([]);
  });

  it('ignores activities from an older patient that resolve after the latest patient', async () => {
    const activitiesA = deferred();
    mocks.getPatientSummary
      .mockResolvedValueOnce({ data: { profile: { name: 'A' }, metrics: {}, modulesStatus: {} }, error: null })
      .mockResolvedValueOnce({ data: { profile: { name: 'B' }, metrics: {}, modulesStatus: {} }, error: null });
    mocks.getPatientRecordFoundation
      .mockResolvedValueOnce({ data: { patient: { name: 'A' }, records: [] }, error: null })
      .mockResolvedValueOnce({ data: { patient: { name: 'B' }, records: [] }, error: null });
    mocks.getPatientActivities
      .mockReturnValueOnce(activitiesA.promise)
      .mockResolvedValueOnce({ data: [{ id: 'activity-b' }], error: null });
    const { result, rerender } = renderHook(({ patientId }) => usePatientHub(patientId), { initialProps: { patientId: 'a' } });
    await waitFor(() => expect(mocks.getPatientActivities).toHaveBeenCalledWith('a', 100));
    rerender({ patientId: 'b' });
    await waitFor(() => expect(result.current.activities).toEqual([{ id: 'activity-b' }]));
    await act(async () => {
      activitiesA.resolve({ data: [{ id: 'activity-a' }], error: null });
      await activitiesA.promise;
    });
    expect(result.current.activities).toEqual([{ id: 'activity-b' }]);
    expect(result.current.activitiesLoading).toBe(false);
  });

  it('completes loading during StrictMode effect replay', async () => {
    const wrapper = ({ children }) => createElement(StrictMode, null, children);
    const { result } = renderHook(() => usePatientHub('patient-1'), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.patientData?.name).toBe('Ana');
  });
});
