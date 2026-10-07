import {describe,it,expect} from 'vitest';
import {ratio,hours,validateProductMetrics,validateProductCaptures} from './productMetrics';
const fixture=()=>({schema_version:1,definition_version:'activation-v1-candidate',window_days:30,generated_at:'2026-10-07T10:00:00Z',data_through:'2026-10-07T10:00:00Z',capture_started_at:'2026-09-01T00:00:00Z',timezone:'America/Fortaleza',retention_days:180,population:'Synthetic',professional_population:12,historical_uncovered:1,both_sides_episodes:2,patient_journey:{eligible_episodes:10,published_episodes:4,recent_episodes:1,diary_eligible:3,diary_used:2},activation:{eligible:10,activated:4,recent:1,median_hours:12,p90_hours:24},return:{eligible:3,returned:2,incomplete:1},consent:{allowed:5,not_allowed_or_unknown:7},modules:[{kind:'plan_published',operations:4,actors:4}],weekly:[{week:'2026-10-05',operations:4,actors:4}],limitations:['No clinical outcomes']});
describe('independent product metric presentation',()=>{
 it('renders n/N and does not fabricate a rate for absent denominators',()=>{expect(ratio(4,10)).toBe('40%');for(const pair of [[0,0],[11,10],[-1,10],[1,null],[NaN,1]])expect(ratio(...pair)).toBe('Indisponível');expect(hours(null)).toBe('Sem ativação observada');});
 it('accepts coherent populations and refuses impossible, duplicate or malformed aggregates',()=>{
  expect(validateProductMetrics(fixture())).toEqual(fixture());
  for(const change of [d=>d.activation.activated=11,d=>d.return.eligible=5,d=>d.consent.allowed=6,d=>d.activation.p90_hours=4,d=>d.activation.median_hours=NaN,d=>d.modules.push(d.modules[0]),d=>d.modules[0].kind='constructor',d=>d.weekly[0].week='2026-02-30',d=>d.weekly[0].actors=5,d=>d.retention_days=0,d=>d.patient_journey.diary_used=4]){const d=fixture();change(d);expect(()=>validateProductMetrics(d)).toThrow();}
 });
 it('distinguishes a missing provider and validates received captures independently of database metrics',()=>{
  const base={schema_version:1,window_days:30,state:'not_configured',generated_at:'2026-10-07T10:00:00Z',data_through:null,rows:[]};
  expect(validateProductCaptures(base,30)).toEqual(base);
  const row={event:'meal_plan_published',outcome:'capture',captures:4,observed_people:2,last_observed_at:'2026-10-07T09:00:00Z'};
  const data={...base,state:'available',rows:[row],last_observed_at:row.last_observed_at};expect(validateProductCaptures(data,30)).toEqual(data);
  for(const changed of [{...data,rows:[row,row]},{...data,rows:[{...row,event:'constructor'}]},{...data,rows:[{...row,observed_people:5}]},{...data,last_observed_at:null},{...data,window_days:90},{...data,state:'not_configured'}])expect(()=>validateProductCaptures(changed,30)).toThrow();
 });
});
