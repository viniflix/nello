import {invalidateDomain} from '@/infrastructure/realtime/events';
/* eslint-disable import/first */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const createQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

let latestClient;
const createWrapper = () => {
  const queryClient = createQueryClient();latestClient=queryClient;
  return ({ children }) => createElement(QueryClientProvider, { client: queryClient }, children);
};
const mocks = vi.hoisted(() => ({
  getPatientSummary: vi.fn(),
  getPatientActivities: vi.fn(),
  getPatientHubOperationalContext: vi.fn(),
  calculateDiaryAdherence: vi.fn(),
  getPatientRecordFoundation: vi.fn(),
  listPatientLegalGuardians: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'nutritionist-1' } }) }));
vi.mock('@/lib/supabase/patient-queries', () => ({
  getPatientSummary: mocks.getPatientSummary,
  getPatientActivities: mocks.getPatientActivities,
  getPatientHubOperationalContext: mocks.getPatientHubOperationalContext,
}));
vi.mock('@/lib/supabase/food-diary-queries', () => ({
  calculateDiaryAdherence: mocks.calculateDiaryAdherence,
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

beforeEach(()=>{
 vi.clearAllMocks();
 mocks.getPatientSummary.mockResolvedValue({data:{profile:{id:'patient-1',name:'Synthetic',birth_date:'1980-01-01'},metrics:{},modulesStatus:{}}});
 mocks.getPatientActivities.mockResolvedValue({data:[{id:'synthetic-activity'}]});
 mocks.getPatientRecordFoundation.mockResolvedValue({data:{patient:{name:'Synthetic'},records:[]}});
 mocks.getPatientHubOperationalContext.mockResolvedValue({data:{}});
 mocks.calculateDiaryAdherence.mockResolvedValue({data:null});mocks.listPatientLegalGuardians.mockResolvedValue({data:[]});
});
it('retains confirmed activities and exposes a read failure instead of a successful empty feed',async()=>{
 const {result}=renderHook(()=>usePatientHub('patient-1'),{wrapper:createWrapper()});
 await waitFor(()=>expect(result.current.activities).toHaveLength(1));
 mocks.getPatientActivities.mockResolvedValue({data:null,error:{code:'NETWORK_FAILURE'}});
 await act(async()=>result.current.loadActivities());
 await waitFor(()=>expect(mocks.getPatientActivities).toHaveBeenCalledTimes(2));
 await waitFor(()=>expect(latestClient.getQueryCache().findAll({queryKey:['patient-hub-activities','patient-1']}).every(query=>query.state.fetchStatus==='idle')).toBe(true));
 expect(result.current.activities).toHaveLength(1);
 expect(result.current.activitiesResource.error.kind).toBe('network');
});
it('keeps the profile section when an auxiliary foundation promise rejects',async()=>{
 mocks.getPatientRecordFoundation.mockRejectedValue({code:'NETWORK_FAILURE'});
 const {result}=renderHook(()=>usePatientHub('patient-1'),{wrapper:createWrapper()});
 await waitFor(()=>expect(result.current.loading).toBe(false));
 expect(result.current.patientData?.name).toBe('Synthetic');
});
it('masks denied cached summary data after a successful read',async()=>{
 const {result}=renderHook(()=>usePatientHub('patient-1'),{wrapper:createWrapper()});
 await waitFor(()=>expect(result.current.patientData?.name).toBe('Synthetic'));
 mocks.getPatientSummary.mockResolvedValue({data:null,error:{status:403}});
 await act(async()=>result.current.refresh());
 await waitFor(()=>expect(result.current.error).toBeTruthy());
 expect(result.current.patientData).toBeNull();
});

it('binds access masking to the actor rather than the viewed patient',async()=>{
 const {result}=renderHook(()=>usePatientHub('patient-1'),{wrapper:createWrapper()});await waitFor(()=>expect(result.current.patientData?.name).toBe('Synthetic'));
 act(()=>invalidateDomain('nutritionist-1','access'));
 expect(result.current.patientData).toBeNull();expect(result.current.activities).toEqual([]);expect(result.current.canWriteEpisode).toBe(false);
});
