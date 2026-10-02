import {describe,expect,it,vi} from 'vitest';
import {collectBoundedPages,pageBounds} from './bounded-pages';
describe('bounded database pagination',()=>{
 it('reads 1001 tied synthetic records without gaps or duplicates',async()=>{
  const rows=Array.from({length:1001},(_,id)=>({id,created_at:'2026-10-02'}));
  const fetch=vi.fn(async(offset,size)=>({data:rows.slice(offset,offset+size)}));
  const result=await collectBoundedPages(fetch);
  expect(result).toEqual(rows);expect(new Set(result.map(x=>x.id)).size).toBe(1001);expect(fetch).toHaveBeenCalledTimes(5);
 });
 it('fails explicitly instead of silently returning a partial clinical report',async()=>{
  await expect(collectBoundedPages(async(_,size)=>({data:Array(size).fill({})}),{pageSize:5,maxRows:10})).rejects.toThrow('REPORT_ROW_LIMIT_REACHED');
 });
 it('propagates abort and failure without retrying writes',async()=>{
  const controller=new AbortController();controller.abort();const build=vi.fn();
  await expect(collectBoundedPages(build,{signal:controller.signal})).rejects.toThrow();expect(build).not.toHaveBeenCalled();
  await expect(collectBoundedPages(async()=>({error:new Error('failed')}))).rejects.toThrow('failed');
 });
 it('bounds invalid pagination inputs',()=>{
  expect(pageBounds(Infinity,-9)).toEqual({size:50,start:0,end:49});
  expect(pageBounds(1000,1.9)).toEqual({size:250,start:1,end:250});
 });
});
