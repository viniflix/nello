import {act,renderHook} from '@testing-library/react';
import {expect,it} from 'vitest';
import {invalidateDomain} from '@/infrastructure/realtime/events';
import {useQueryResource} from './useQueryResource';
it('masks confirmed cache immediately on access change until a new successful read',()=>{
 const key=JSON.stringify(['synthetic-query-a','records']);const initial={data:['private'],dataUpdatedAt:1,status:'success'};
 const {result,rerender}=renderHook(({query})=>useQueryResource(query,key,[]),{initialProps:{query:initial}});
 act(()=>invalidateDomain('synthetic-query-a','access'));expect(result.current.data).toEqual([]);expect(result.current.canAct).toBe(false);
 rerender({query:{...initial,isFetching:true}});expect(result.current.data).toEqual([]);
 rerender({query:{...initial,dataUpdatedAt:2}});expect(result.current.hasSnapshot).toBe(true);
});
