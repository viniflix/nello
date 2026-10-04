import {beforeEach,it,expect,vi} from 'vitest';
import {createCustomMeasure,updateCustomMeasure,countCustomMeasures} from './custom-measures-queries';
const mock=vi.hoisted(()=>({auth:vi.fn(),from:vi.fn(),query:{}}));
vi.mock('@/lib/customSupabaseClient',()=>({supabase:{auth:{getUser:mock.auth},from:mock.from}}));
vi.mock('@/lib/supabase/query-helpers',()=>({logSupabaseError:vi.fn()}));
beforeEach(()=>{
 vi.resetAllMocks();mock.auth.mockResolvedValue({data:{user:{id:'owner'}}});
 mock.query={select:vi.fn(),eq:vi.fn(),insert:vi.fn(),update:vi.fn(),single:vi.fn()};
 mock.from.mockReturnValue(mock.query);for(const method of ['select','eq','insert','update'])mock.query[method].mockReturnValue(mock.query);
 mock.query.then=(resolve)=>Promise.resolve({count:0,error:null}).then(resolve);
 mock.query.single.mockResolvedValue({data:{id:1}});
});
it('preserves auth transport failure and never inserts',async()=>{
 const failure={message:'Failed to fetch',status:503};mock.auth.mockResolvedValue({data:null,error:failure});
 expect((await createCustomMeasure({name:'Colher',grams_equivalent:20})).error).toBe(failure);expect(mock.query.insert).not.toHaveBeenCalled();
});
it('returns a classified missing-session error without querying the database',async()=>{
 mock.auth.mockResolvedValue({data:{user:null},error:null});
 expect((await createCustomMeasure({name:'Colher',grams_equivalent:20})).error).toMatchObject({status:401,code:'AUTH_SESSION_MISSING'});expect(mock.from).not.toHaveBeenCalled();
});
it('does not treat a failed count as zero or insert afterwards',async()=>{
 const failure={code:'42501'};mock.query.then=(resolve)=>Promise.resolve({error:failure}).then(resolve);
 await expect(countCustomMeasures('owner')).rejects.toBe(failure);
 expect((await createCustomMeasure({name:'Colher',grams_equivalent:20})).error).toBe(failure);expect(mock.query.insert).not.toHaveBeenCalled();
});
it.each([NaN,Infinity,-Infinity,'abc',0,-1])('rejects invalid equivalence %s in create and update',async(value)=>{
 expect((await createCustomMeasure({name:'Colher',grams_equivalent:value})).error).toBeTruthy();
 expect((await updateCustomMeasure(1,{grams_equivalent:value})).error).toBeTruthy();expect(mock.from).not.toHaveBeenCalled();
});
it('counts within the verified account and accepts positive decimal grams',async()=>{
 expect((await createCustomMeasure({name:' Colher ',grams_equivalent:'12.5'})).error).toBeNull();
 expect(mock.query.eq).toHaveBeenCalledWith('nutritionist_id','owner');
 expect(mock.query.insert).toHaveBeenCalledWith([expect.objectContaining({nutritionist_id:'owner',name:'Colher',grams_equivalent:12.5})]);
});
