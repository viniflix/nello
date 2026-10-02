import {it,expect,vi,beforeEach} from 'vitest';
import {renderHook,act,waitFor} from '@testing-library/react';
import {fetchAllNutritionistPatients} from '@/lib/supabase/patient-queries';
import {usePatientListData} from './usePatientListData';
vi.mock('@/lib/supabase/patient-queries',()=>({fetchAllNutritionistPatients:vi.fn()}));
beforeEach(()=>vi.resetAllMocks());
it('contains a rejected query and can recover without a render/request loop',async()=>{
 fetchAllNutritionistPatients.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue({active:[{id:'a'}],archived:[]});
 const {result}=renderHook(()=>usePatientListData('owner'));await waitFor(()=>expect(result.current.error?.kind).toBe('network'));
 expect(fetchAllNutritionistPatients).toHaveBeenCalledOnce();
 await act(()=>result.current.fetchPatients());expect(result.current.patients).toEqual([{id:'a'}]);expect(result.current.error).toBeNull();
});
it('rejects a late response from the previous account',async()=>{
 let finish;fetchAllNutritionistPatients.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve})).mockResolvedValue({active:[{id:'new'}]});
 const {result,rerender}=renderHook(({id})=>usePatientListData(id),{initialProps:{id:'old'}});rerender({id:'new'});await waitFor(()=>expect(result.current.patients[0]?.id).toBe('new'));
 await act(async()=>finish({active:[{id:'old'}]}));expect(result.current.patients[0].id).toBe('new');
});
it('ignores a superseded reload and an unmounted result',async()=>{
 let old;fetchAllNutritionistPatients.mockImplementationOnce(()=>new Promise(resolve=>{old=resolve})).mockResolvedValue({active:[{id:'fresh'}]});
 const {result,unmount}=renderHook(()=>usePatientListData('a'));await act(()=>result.current.fetchPatients());await act(async()=>old({active:[{id:'stale'}]}));expect(result.current.patients[0].id).toBe('fresh');unmount();
});
