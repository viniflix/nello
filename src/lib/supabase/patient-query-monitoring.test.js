import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {getPatientsHighRiskLabAlerts} from './patient-query-monitoring';
const mocks=vi.hoisted(()=>({rows:[],requests:[],failure:null,rules:vi.fn()}));
vi.mock('@/infrastructure/supabase/query-helpers',()=>({logSupabaseError:vi.fn()}));
vi.mock('@/lib/supabase/lab-results-queries',async original=>({...await original(),getLabRiskRules:mocks.rules}));
vi.mock('@/lib/supabase/idempotent-mutations',()=>({clinicalRpc:vi.fn()}));
vi.mock('@/lib/storage/verifiedUpload',()=>({uploadVerifiedFile:vi.fn()}));
vi.mock('@/lib/storage/privateFiles',()=>({parsePrivateFile:vi.fn(),signPrivateFile:vi.fn()}));
vi.mock('@/infrastructure/supabase/domainClients',()=>({patientClient:{from:()=>{
  const request={filters:[],orders:[],start:0,end:999};mocks.requests.push(request);
  const q={select:()=>q,in:(k,v)=>{request.filters.push(r=>v.includes(r[k]));return q;},eq:(k,v)=>{request.filters.push(r=>r[k]===v);return q;},gte:(k,v)=>{request.filters.push(r=>r[k]>=v);return q;},order:(k,o)=>{request.orders.push([k,o]);return q;},limit:n=>{request.end=n-1;return q;},range:(a,b)=>{request.start=a;request.end=b;return q;},abortSignal:()=>q,
    then:(resolve,reject)=>Promise.resolve({data:mocks.rows.filter(r=>request.filters.every(f=>f(r))).sort((a,b)=>String(b.test_date).localeCompare(String(a.test_date))||String(b.created_at).localeCompare(String(a.created_at))||String(b.id).localeCompare(String(a.id))).slice(request.start,request.end+1),error:mocks.failure}).then(resolve,reject)};return q;
}}}));
const input={nutritionistId:'owner',patientIds:['patient'],careEpisodeIds:['episode']};
const row=(id,extra={})=>({id:String(id).padStart(6,'0'),patient_id:'patient',care_episode_id:'episode',test_name:'Synthetic marker',test_value:'200',test_unit:'mg/dL',reference_min:50,reference_max:100,test_date:'2026-10-16',created_at:'2026-10-16T12:00:00Z',is_latest_revision:true,record_status:'active',...extra});
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-16T15:00:00Z'));mocks.rows=[];mocks.requests=[];mocks.failure=null;mocks.rules.mockResolvedValue({data:[],error:null});});
afterEach(()=>vi.useRealTimers());
describe('current laboratory evidence in the operational feed',()=>{
  it('excludes invalidated and superseded records rather than resurrecting their risk',async()=>{
    mocks.rows=[row(1,{record_status:'invalidated'}),row(2,{is_latest_revision:false}),row(3,{test_value:'80'})];
    expect((await getPatientsHighRiskLabAlerts(input)).data).toEqual([]);
  });
  it('a later normal result removes the prior current alert, but not another marker',async()=>{
    mocks.rows=[row(1,{test_date:'2026-10-15'}),row(2,{test_value:'80'}),row(3,{test_name:'Another synthetic marker'})];
    const res=await getPatientsHighRiskLabAlerts(input);expect(res.error).toBeNull();expect(res.data).toHaveLength(1);expect(res.data[0].result_id).toBe(row(3).id);
  });
  it('reads past 500 recent results and retains an older high-risk marker',async()=>{
    mocks.rows=[...Array.from({length:501},(_,i)=>row(i,{test_value:'80'})),row(600,{test_name:'Older unique marker',test_date:'2026-10-14'})];
    const res=await getPatientsHighRiskLabAlerts(input);expect(res.error).toBeNull();expect(res.data).toHaveLength(1);expect(res.data[0].test_name).toBe('Older unique marker');expect(mocks.requests.length).toBeGreaterThan(1);
  });
  it('returns an explicit failure beyond the collection ceiling',async()=>{
    mocks.rows=Array.from({length:10001},(_,i)=>row(i));const res=await getPatientsHighRiskLabAlerts(input);expect(res.data).toEqual([]);expect(res.error).toBeTruthy();
  });
  it('uses date, creation time and id for deterministic selection, with occurrence identity',async()=>{
    mocks.rows=[row(1),row(2)];const res=await getPatientsHighRiskLabAlerts(input);expect(res.data).toHaveLength(1);expect(res.data[0].result_id).toBe(row(2).id);expect(res.data[0].care_episode_id).toBe('episode');expect(mocks.requests[0].orders.map(([k])=>k)).toEqual(['test_date','created_at','id']);
  });
  it('does not mix a patient with another patient’s episode',async()=>{
    mocks.rows=[row(1,{care_episode_id:'other-episode'})];const res=await getPatientsHighRiskLabAlerts({...input,patientIds:['patient','other'],careEpisodeIds:['episode','other-episode']});expect(res.data).toEqual([]);
  });
  it('propagates source and rule failures without a successful empty result',async()=>{
    mocks.rules.mockResolvedValueOnce({data:[],error:{status:403}});expect((await getPatientsHighRiskLabAlerts(input)).error.status).toBe(403);
    mocks.failure={status:400};expect((await getPatientsHighRiskLabAlerts(input)).error.status).toBe(400);
  });
});
