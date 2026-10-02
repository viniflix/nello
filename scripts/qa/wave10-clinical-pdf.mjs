import { assertIsolatedRuntime } from './isolated-runtime.mjs';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { calculateEnergyPlan } from '../../supabase/functions/_shared/clinical-energy-plan.js';
import { inspectPdf } from './pdf-content.mjs';
assertIsolatedRuntime();
const fixture=JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json','utf8'));
assert(['http://localhost:54321','http://127.0.0.1:54321'].includes(new URL(fixture.url).origin));
const actor=async key=>{const c=createClient(fixture.url,fixture.anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const result=await c.auth.signInWithPassword({email:fixture.personas[key].email,password:fixture.password});assert.equal(result.error,null);return c;};
const owner=await actor('nutritionist-b'),foreign=await actor('nutritionist-a');
const plan=calculateEnergyPlan({weight:70,height:175,age:30,gender:'M',protocol:'harris',clinicalMobility:'ambulatory',injuryFactorId:'peritonitis',injuryFactor:1.4,targetWeight:68,timeframeDays:42});
assert(plan.valid);assert.equal(plan.tmbResult,1702.0125);assert.equal(plan.getResult,3097.66275);
const row={patient_id:fixture.personas['patient-b'].id,nutritionist_id:fixture.personas['nutritionist-b'].id,
 weight:70,height:175,age:30,gender:'M',tmb_protocol:'harris',protocol:'harris',protocol_code:'energy.harris_benedict_1919_clinical',protocol_version:1,
 confirmed_by:fixture.personas['nutritionist-b'].id,confirmed_at:new Date().toISOString(),
 activity_factor:1,activity_level:1,injury_factor:1.4,tmb_result:plan.tmbResult,tmb:plan.tmbResult,get_result:plan.getResult,get:plan.getResult,
 venta_target_weight:68,venta_timeframe_days:42,venta_adjustment_kcal:plan.ventaAdjustmentKcal,final_planned_kcal:plan.finalPlannedKcal,mets_activities:[],
 source_snapshot:{engine_version:6,arithmetic_policy:plan.arithmeticPolicy},
 input_snapshot:{weight_kg:70,height_cm:175,age_years:30,sex:'M',activity_factor:1,injury_factor:1.4,injury_factor_id:'peritonitis',clinical_mobility:'ambulatory',mobility_factor:1.3,
 venta_target_weight:68,venta_timeframe_days:42,venta_review:{confirmed:true},biometry_sources:{weight:'manual'}},
 output_snapshot:{tmb_kcal:plan.tmbResult,get_kcal:plan.getResult,planned_kcal:plan.finalPlannedKcal,venta_adjustment_kcal:plan.ventaAdjustmentKcal,calculation_details:plan}};
const saved=await owner.from('energy_expenditure_calculations').insert(row).select().single();assert.equal(saved.error,null);
row.id=saved.data.id;
const {id:ignoredId,...newRow}=row;assert(ignoredId);
const rejected=await owner.from('energy_expenditure_calculations').insert({...newRow,get_result:3098});assert.equal(rejected.error?.code,'23514');
const forged=structuredClone(newRow);forged.output_snapshot.calculation_details.exactResults.get.numerator='1';
const auditRejected=await owner.from('energy_expenditure_calculations').insert(forged);assert.equal(auditRejected.error?.code,'23514');
const changed=await owner.from('energy_expenditure_calculations').update({get_result:1}).eq('id',row.id);assert(changed.error,'Saved clinical values cannot be overwritten');
const reread=await owner.from('energy_expenditure_calculations').select('get_result').eq('id',row.id).single();assert.equal(reread.data.get_result,3097.66275);
const results=[{name:'clinical save and independent SQL tamper/immutability contracts',passed:true}];
const request=async(c,body,status)=>{const {data}=await c.auth.getSession();const start=performance.now();
 const response=await fetch(fixture.url+'/functions/v1/generate-pdf',{method:'POST',headers:{authorization:'Bearer '+data.session.access_token,apikey:fixture.anonKey,origin:'https://nellonutri.com.br','content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
 const bytes=Buffer.from(await response.arrayBuffer());assert.equal(response.status,status);results.push({status,bytes:bytes.length,durationMs:Math.round(performance.now()-start),passed:true});return bytes;};
const output='.backend-ci/wave10-results';mkdirSync(output,{recursive:true});
const bytes=await request(owner,{energyCalculationId:row.id,format:'binary'},200);
assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert(bytes.length<=2*1024*1024);
const parsed=await inspectPdf(bytes);assert(parsed.pages>=1&&parsed.pages<=50);
for(const expected of ['1702.01','3097.66','366.67','2731.00','13.7516','5.0033','6.755','https://doi.org/10.1073/pnas.4.12.370'])assert(parsed.text.includes(expected),'Actual PDF includes '+expected);
writeFileSync(output+'/energy-synthetic.pdf',bytes);
await request(foreign,{energyCalculationId:row.id,format:'binary'},404);
await request(owner,{energyCalculationId:row.id,format:'binary',lines:['forged result']},400);
await request(owner,{energyCalculationId:row.id,format:'binary',documentArtifactId:randomUUID()},400);
const legacy={...newRow,source_snapshot:{engine_version:5},output_snapshot:{},tmb_result:1900,tmb:1900,get_result:2400,get:2400,final_planned_kcal:2400,venta_adjustment_kcal:null,venta_target_weight:null,venta_timeframe_days:null};
const old=await owner.from('energy_expenditure_calculations').insert(legacy).select('id').single();assert.equal(old.error,null);legacy.id=old.data.id;
const oldPdf=await inspectPdf(await request(owner,{energyCalculationId:legacy.id,format:'binary'},200));assert(oldPdf.text.includes('Motor: 5'));assert(oldPdf.text.includes('TMB: 1900'));assert(oldPdf.text.includes('GET: 2400'));
const meal=await owner.rpc('create_meal_plan_atomic',{p_plan_data:{patient_id:row.patient_id,name:'QA plano servidor',is_active:false,hybrid:true,days:[]}});assert.equal(meal.error,null);
const mealPdf=await inspectPdf(await request(owner,{mealPlanId:meal.data,format:'binary'},200));assert(mealPdf.text.includes('QA plano servidor'));assert(mealPdf.text.includes('QA patient-b'));
await request(foreign,{mealPlanId:meal.data,format:'binary'},404);
const anamId=randomUUID();
const sql=input=>execFileSync('docker',['exec','-i','-e','PGPASSWORD=postgres','supabase_db_nello-reconstruction','psql','-X','-h','127.0.0.1','-U','supabase_admin','-d','postgres','-At','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',timeout:30000});
sql(`INSERT INTO public.anamnesis_records(id,patient_id,nutritionist_id,content) VALUES ('${anamId}','${row.patient_id}','${row.nutritionist_id}','{"note":"QA anamnese histórica"}');`);
const anamPdf=await inspectPdf(await request(owner,{anamnesisRecordId:anamId,format:'binary'},200));assert(anamPdf.text.includes('QA anamnese histórica'));
await request(foreign,{anamnesisRecordId:anamId,format:'binary'},404);
const episode=await owner.from('care_episodes').select('id').eq('patient_id',row.patient_id).eq('status','active').single();assert.equal(episode.error,null);
const newGrowth=weight=>Number(sql(`INSERT INTO public.growth_records(patient_id,care_episode_id,weight,height,record_date) VALUES ('${row.patient_id}','${episode.data.id}',${weight},175,current_date-1) RETURNING id;`).trim().split(/\r?\n/)[0]);
const secondGrowth=newGrowth(71),firstGrowth=newGrowth(70);
const anthroPdf=await inspectPdf(await request(owner,{anthropometryRecordId:firstGrowth,compareRecordId:secondGrowth,format:'binary'},200));assert(anthroPdf.text.includes('Peso: 71 kg'));
await request(foreign,{title:'W'.repeat(160),lines:Array(70).fill('W'.repeat(1000)),format:'binary'},413);
const wide=await request(foreign,{title:'W'.repeat(160),lines:Array(40).fill('W'.repeat(140)),format:'binary'},200);const widePdf=await inspectPdf(wide);assert(widePdf.pages<=50);assert.equal(widePdf.text.replace(/\s/g,'').split('W').length-1,5760);writeFileSync(output+'/wide-synthetic.pdf',wide);
const memory=process.memoryUsage();writeFileSync(output+'/pdf.json',JSON.stringify({passed:true,productionData:false,results,pages:parsed.pages,maxBytes:2*1024*1024,maxPages:50,harnessRssBytes:memory.rss,memoryScope:'Node QA harness; not a per-request Edge peak measurement',capturedAt:new Date().toISOString()},null,2));
console.log('PASS: clinical PDF mathematics/content, saved-history compatibility, tamper/RLS authorization, binary/page limits and wide-glyph wrapping.');
