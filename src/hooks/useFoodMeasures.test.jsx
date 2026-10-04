import {it,expect,vi,beforeEach} from 'vitest';
import {renderHook,act,waitFor} from '@testing-library/react';
import {getFoodMeasures} from '@/lib/supabase/foodService';
import {useFoodMeasures} from './useFoodMeasures';
vi.mock('@/lib/supabase/foodService',()=>({getFoodMeasures:vi.fn()}));
const auth=vi.hoisted(()=>({user:{id:'account'}}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>auth}));
beforeEach(()=>{vi.resetAllMocks();auth.user={id:'account'};});
it('clears already loaded conversions while a different food loads',async()=>{
 getFoodMeasures.mockResolvedValueOnce([{id:'loaded-old'}]).mockImplementationOnce(()=>new Promise(()=>{}));
 const {result,rerender}=renderHook(({id})=>useFoodMeasures(id),{initialProps:{id:'old'}});
 await waitFor(()=>expect(result.current.data).toEqual([{id:'loaded-old'}]));rerender({id:'new'});
 expect(result.current.isLoading).toBe(true);expect(result.current.data).toEqual([]);
});
it('ignores a prior account response even when the food ID stays the same',async()=>{
 let finish;getFoodMeasures.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve})).mockResolvedValue([]);
 const {result,rerender}=renderHook(()=>useFoodMeasures('custom-food'));auth.user={id:'other-account'};rerender();expect(result.current.data).toEqual([]);
 await waitFor(()=>expect(result.current.isLoading).toBe(false));await act(async()=>finish([{id:'private-old'}]));expect(result.current.data).toEqual([]);
});
it('does not show conversions from the previous food after switching or clearing the food',async()=>{
 let finish;getFoodMeasures.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve})).mockResolvedValue([{id:'new'}]);
 const {result,rerender}=renderHook(({id})=>useFoodMeasures(id),{initialProps:{id:'old'}});
 rerender({id:'new'});await waitFor(()=>expect(result.current.data).toEqual([{id:'new'}]));
 await act(async()=>finish([{id:'old'}]));expect(result.current.data).toEqual([{id:'new'}]);
 rerender({id:null});expect(result.current.data).toEqual([]);expect(result.current.isLoading).toBe(false);
});
it('ignores superseded requests, surfaces a failure and recovers',async()=>{
 let finish;getFoodMeasures.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve})).mockResolvedValue([{id:'fresh'}]);
 const {result}=renderHook(()=>useFoodMeasures('food'));await act(()=>result.current.refetch());
 await act(async()=>finish([{id:'stale'}]));expect(result.current.data).toEqual([{id:'fresh'}]);
 getFoodMeasures.mockRejectedValueOnce(new TypeError('Failed to fetch'));await act(()=>result.current.refetch());expect(result.current.error).toBeTruthy();expect(result.current.data).toEqual([]);
 await act(()=>result.current.refetch());expect(result.current.error).toBeNull();expect(result.current.data).toEqual([{id:'fresh'}]);
});
