import { beforeEach, expect, it, vi } from 'vitest';
import { getLatestClinicalWeights, getLatestSelfWeights, getLatestGlycemia } from './indicator-queries';
const mock=vi.hoisted(()=>({calls:[]}));
vi.mock('@/infrastructure/supabase/client',()=>({supabase:{from:table=>{const call={table,steps:[]};mock.calls.push(call);const query={then:resolve=>Promise.resolve({data:[],error:null}).then(resolve)};for(const name of ['select','eq','gt','lt','gte','lte','order','limit'])query[name]=(...args)=>{call.steps.push([name,...args]);return query;};return query;}}}));
beforeEach(()=>{mock.calls=[];});
it('bounds clinical reads to current valid weights owned by this patient',async()=>{
 await getLatestClinicalWeights('synthetic-a');const call=mock.calls[0];expect(call.table).toBe('growth_records');
 expect(call.steps).toEqual(expect.arrayContaining([['eq','patient_id','synthetic-a'],['eq','status','active'],['eq','is_latest_revision',true],['gt','weight',0],['lt','weight','Infinity'],['limit',2]]));
 expect(call.steps.filter(step=>step[0]==='order').map(step=>step[1])).toEqual(['record_date','created_at','id']);
 expect(call.steps.find(step=>step[0]==='select')[1].split(',')).toEqual(expect.arrayContaining(['id','weight','record_date','created_at']));
});
it('keeps self weights separate and excludes measure-only records before limiting',async()=>{
 await getLatestSelfWeights('synthetic-a');const call=mock.calls[0];expect(call.table).toBe('patient_progress_measurements');
 expect(call.steps).toEqual(expect.arrayContaining([['eq','patient_id','synthetic-a'],['gt','weight',0],['lt','weight','Infinity'],['limit',2]]));
 expect(call.steps.filter(step=>step[0]==='order').map(step=>step[1])).toEqual(['record_date','created_at','id']);
});
it('reads the existing glucose value, context and date within its current numeric contract',async()=>{
 await getLatestGlycemia('synthetic-a');const call=mock.calls[0];expect(call.table).toBe('glycemia_records');
 expect(call.steps).toEqual(expect.arrayContaining([['eq','patient_id','synthetic-a'],['gte','value',20],['lte','value',600],['limit',1]]));
 expect(call.steps.find(step=>step[0]==='select')[1].split(',')).toEqual(expect.arrayContaining(['value','date','condition','created_at']));
});
