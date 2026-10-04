import {beforeEach, it, expect, vi} from 'vitest';
import {renderHook, act, waitFor} from '@testing-library/react';
import {useCustomMeasures, useActiveCustomMeasures} from './useCustomMeasures';
import {useAllMeasures} from './useHouseholdMeasures';
import {getAllCustomMeasures, getCustomMeasures} from '@/lib/supabase/custom-measures-queries';
import {getAllHouseholdMeasures} from '@/lib/supabase/food-measures-queries';
const auth=vi.hoisted(()=>({user:{id:'account-a'}}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>auth}));
vi.mock('@/lib/supabase/custom-measures-queries',()=>({getAllCustomMeasures:vi.fn(),getCustomMeasures:vi.fn(),createCustomMeasure:vi.fn(),updateCustomMeasure:vi.fn(),deleteCustomMeasure:vi.fn()}));
vi.mock('@/lib/supabase/food-measures-queries',()=>({getAllHouseholdMeasures:vi.fn()}));
beforeEach(()=>{vi.resetAllMocks();auth.user={id:'account-a'};getAllHouseholdMeasures.mockResolvedValue({data:[{code:'g'}]});getCustomMeasures.mockResolvedValue({data:[]});getAllCustomMeasures.mockResolvedValue({data:[]});});
it('surfaces a private query failure without hiding public measures',async()=>{
 const failure={code:'42501'};getCustomMeasures.mockResolvedValue({data:[],error:failure});
 const {result}=renderHook(()=>useAllMeasures());await waitFor(()=>expect(result.current.isLoading).toBe(false));
 expect(result.current.error).toBe(failure);expect(result.current.systemMeasures[0].code).toBe('g');
});
it.each([[useCustomMeasures,getAllCustomMeasures],[useActiveCustomMeasures,getCustomMeasures]])('isolates measures on switch/logout and ignores a previous response',async(hook,query)=>{
 let finish;query.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve})).mockResolvedValue({data:[{id:'b'}]});
 const {result,rerender}=renderHook(()=>hook());auth.user={id:'account-b'};rerender();
 expect(result.current.data).toEqual([]);await waitFor(()=>expect(result.current.data).toEqual([{id:'b'}]));
 await act(async()=>finish({data:[{id:'a'}]}));expect(result.current.data).toEqual([{id:'b'}]);
 auth.user=null;rerender();expect(result.current.data).toEqual([]);expect(result.current.error).toBeNull();
 expect(query).toHaveBeenLastCalledWith('account-b');
});
it('ignores a superseded reload and clears private data on failure',async()=>{
 let finish;getCustomMeasures.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve})).mockResolvedValue({data:[{id:'fresh'}]});
 const {result}=renderHook(()=>useActiveCustomMeasures());await act(()=>result.current.refetch());
 await act(async()=>finish({data:[{id:'stale'}]}));expect(result.current.data).toEqual([{id:'fresh'}]);
 getCustomMeasures.mockResolvedValue({error:{status:401}});await act(()=>result.current.refetch());
 expect(result.current.data).toEqual([]);expect(result.current.error.status).toBe(401);
});
it('never relabels loaded private data as belonging to the next account while loading',async()=>{
 getCustomMeasures.mockResolvedValueOnce({data:[{id:'private-a'}]}).mockImplementationOnce(()=>new Promise(()=>{}));
 const {result,rerender}=renderHook(()=>useActiveCustomMeasures());await waitFor(()=>expect(result.current.data).toEqual([{id:'private-a'}]));
 auth.user={id:'account-b'};rerender();expect(result.current.isLoading).toBe(true);expect(result.current.data).toEqual([]);
});
