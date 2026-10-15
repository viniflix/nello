import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { queryClient } from '@/app/config/queryClient';
import { setPrivateSessionOwner } from '@/lib/utils/privateSessionState';
import { getClinicSettings, updateClinicSettings } from './profile-queries';
import { getServices, saveService, deleteService } from './financial-queries';
import { getCustomMeasures, getAllCustomMeasures, createCustomMeasure, updateCustomMeasure, deleteCustomMeasure } from './custom-measures-queries';
import { getFoodMeasures } from './foodService';
import { getAllHouseholdMeasures, getFoodMeasures as getLegacyMeasures, createFoodMeasure, updateFoodMeasure, deleteFoodMeasure } from './food-measures-queries';

const state = vi.hoisted(() => ({ calls:[], tables:{}, denied:false }));
vi.mock('@/infrastructure/supabase/domainClients', async () => {
  const {createClient} = await import('@supabase/supabase-js');
  const client = createClient('http://reference.invalid', 'synthetic-test-key', {
    auth:{persistSession:false, autoRefreshToken:false, detectSessionInUrl:false},
    global:{fetch:async (input, init={}) => {
      const url=new URL(String(input)); const table=url.pathname.split('/').at(-1);
      const method=init.method || 'GET'; state.calls.push({table,method,projection:url.searchParams.get('select')});
      if(state.denied) return new Response(JSON.stringify({code:'42501',message:'synthetic denied'}),{status:403});
      const headers=new Headers(init.headers);
      const single=headers.get('Accept')?.includes('object');
      let rows=state.tables[table] || [];
      const id=url.searchParams.get('id')?.replace('eq.','');
      if(method==='POST') {
        const payload=JSON.parse(init.body); const added=(Array.isArray(payload)?payload:[payload]).map((x,i)=>({id:String(rows.length+i+1),...x}));
        state.tables[table]=[...rows,...added]; rows=added;
      } else if(method==='PATCH') {
        const payload=JSON.parse(init.body); state.tables[table]=rows.map(x=>!id||String(x.id)===id?{...x,...payload}:x);
        rows=state.tables[table].filter(x=>!id||String(x.id)===id);
      } else if(method==='DELETE') { state.tables[table]=rows.filter(x=>String(x.id)!==id); rows=[]; }
      else {
        if(id)rows=rows.filter(x=>String(x.id)===id);
        if(url.searchParams.get('is_active')==='eq.true')rows=rows.filter(x=>x.is_active!==false);
        const owner=url.searchParams.get('nutritionist_id')?.replace('eq.','');
        if(owner)rows=rows.filter(x=>x.nutritionist_id===owner);
      }
      if(method==='HEAD')return new Response(null,{headers:{'content-range':`0-${rows.length-1}/${rows.length}`}});
      return new Response(JSON.stringify(single?rows[0]:rows),{headers:{'content-type':'application/json'}});
    }},
  });
  client.auth.getUser=async()=>({data:{user:{id:'actor-a'}},error:null});
  return {nutritionClient:client, patientClient:client, agendaClient:client, financeClient:client};
});
vi.mock('./idempotent-mutations', () => ({
  insertIdempotently:async (_table,data)=>{const row={id:'service-new',...data};state.tables.services.push(row);return {data:row,error:null};},
  updateIdempotently:async (_table,id,data)=>{const row={...state.tables.services.find(x=>x.id===id),...data};state.tables.services=state.tables.services.map(x=>x.id===id?row:x);return {data:row,error:null};},
  idempotentRpc:vi.fn(),
}));

beforeEach(() => {
  queryClient.clear(); setPrivateSessionOwner('actor-a'); state.calls=[]; state.denied=false;
  state.tables={user_profiles:[{id:'actor-a',clinic_settings:{monthlyFinancialGoal:10},preferences:{}}],
    services:[{id:'service-a',nutritionist_id:'actor-a',name:'Service',price:10,active:true}],
    nutritionist_custom_measures:[{id:'custom-a',nutritionist_id:'actor-a',name:'Custom',code:'custom_a',grams_equivalent:25,is_active:true}],
    household_measures:[{id:1,code:'g',is_active:true}],
    food_measures:[{id:'measure-a',weight_in_grams:40}],
    food_household_measures:[{id:'legacy-a',food_id:'food-a',grams:30,quantity:1}],};
});
afterEach(() => {queryClient.clear();setPrivateSessionOwner(null);});
const reads=table=>state.calls.filter(x=>x.table===table&&x.method==='GET').length;

it('shares concurrent clinic/services reads and invalidates after their successful writes', async () => {
  await Promise.all(Array.from({length:20},()=>getClinicSettings('actor-a')));
  await Promise.all(Array.from({length:20},()=>getServices('actor-a')));
  expect(reads('user_profiles')).toBe(1);expect(reads('services')).toBe(1);
  await updateClinicSettings('actor-a',{monthlyFinancialGoal:20});
  expect((await getClinicSettings('actor-a')).monthlyFinancialGoal).toBe(20);
  await saveService({id:'service-a',nutritionist_id:'actor-a',name:'Updated',price:30});
  expect(Number((await getServices('actor-a'))[0].price)).toBe(30);
  await deleteService('service-a');expect(await getServices('actor-a')).toEqual([]);
});

it('updates both custom projections after create/update/delete without caching the limit preflight', async () => {
  await getCustomMeasures('actor-a');await getAllCustomMeasures('actor-a');
  await createCustomMeasure({name:'Another',grams_equivalent:45});
  expect((await getCustomMeasures('actor-a')).data).toHaveLength(2);
  expect((await getAllCustomMeasures('actor-a')).data).toHaveLength(2);
  await updateCustomMeasure('custom-a',{grams_equivalent:50});
  expect((await getCustomMeasures('actor-a')).data[0].grams_equivalent).toBe(50);
  await deleteCustomMeasure('custom-a');expect((await getAllCustomMeasures('actor-a')).data).toHaveLength(1);
  expect(state.calls.filter(x=>x.method==='HEAD')).toHaveLength(1);
});

it('preserves food DTO aliases and separates the legacy join; its CRUD invalidates only that source', async () => {
  const current=await getFoodMeasures('food-a'); const legacy=await getLegacyMeasures('food-a');
  expect(current[0]).toEqual({id:'measure-a',label:undefined,measure_label:undefined,weight_in_grams:40,quantity_grams:40,grams:40,quantity:1});
  expect(legacy.data[0].grams).toBe(30);
  await createFoodMeasure({food_id:'food-a',measure_id:1,grams:20});
  expect((await getLegacyMeasures('food-a')).data).toHaveLength(2);
  await updateFoodMeasure('legacy-a',{grams:35});expect((await getLegacyMeasures('food-a')).data[0].grams).toBe(35);
  await deleteFoodMeasure('legacy-a');expect((await getLegacyMeasures('food-a')).data).toHaveLength(1);
  await getFoodMeasures('food-a');expect(reads('food_measures')).toBe(1);
});

it('does not invalidate on denied writes; cold denied reads remain errors', async () => {
  await getCustomMeasures('actor-a');state.denied=true;
  expect((await updateCustomMeasure('custom-a',{grams_equivalent:50})).error).toBeTruthy();
  expect((await getCustomMeasures('actor-a')).data[0].grams_equivalent).toBe(25);
  const publicResult=await getAllHouseholdMeasures();expect(publicResult.data).toBeNull();expect(publicResult.error).toBeTruthy();
});
