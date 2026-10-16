import {test,expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {assertIsolatedRuntime} from '../scripts/qa/isolated-runtime.mjs';
assertIsolatedRuntime();
const fixture=JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json'));
if(!['http://localhost:54321','http://localhost:4180'].includes(fixture.url))throw Error('Disposable loopback fixture required');
const client=createClient(fixture.url,fixture.anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
const patient=randomUUID(),label='QA RC02 '+randomUUID().slice(0,8),marker='Synthetic RC02 marker';
const today=new Date().toISOString().slice(0,10),older=new Date(Date.now()-86400000).toISOString().slice(0,10);
let actor;
const sql=input=>execFileSync('docker',['exec','-i','supabase_db_nello-reconstruction','psql','-X','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],{input,stdio:['pipe','ignore','pipe']});
const payload=(value,date=today)=>({patient_id:patient,test_name:marker,test_value:String(value),test_unit:'mg/dL',reference_min:50,reference_max:100,test_date:date});
async function create(value,date){const res=await client.rpc('create_lab_result_record',{p_payload:payload(value,date)});expect(res.error).toBeNull();return res.data;}
async function refresh(page){await page.reload();await expect(page.getByRole('button',{name:'Selecionar itens',exact:true})).toBeVisible();await expect(page.getByRole('alert')).toHaveCount(0);}
const card=page=>page.locator('article').filter({hasText:marker});
test.beforeAll(async()=>{
  const auth=await client.auth.signInWithPassword({email:fixture.personas['nutritionist-a'].email,password:fixture.password});expect(auth.error).toBeNull();actor=auth.data.user.id;
  sql(`INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data) VALUES('${patient}','authenticated','authenticated','${patient}@example.invalid','{"name":"${label}","user_type":"patient"}');
UPDATE public.user_profiles SET nutritionist_id='${actor}' WHERE id='${patient}';
INSERT INTO public.nutritionist_patients(nutritionist_id,patient_id,status) VALUES('${actor}','${patient}','active');`);
});
test.afterAll(async()=>{
  if(actor){expect((await client.rpc('end_care_episode',{p_patient_id:patient,p_end_reason:'ended_by_nutritionist'})).error).toBeNull();await client.auth.signOut();}
});
test('risk beyond 500, resolution, new occurrence, revision and invalidation preserve audit',async({page})=>{
  await page.route(/^https:\/\/[^/]+\.supabase\.co\//,route=>route.abort('blockedbyclient'));
  const first=await create(200,older);
  // Synthetic operator invokes the real clinical producer with the real actor;
  // no hosted DB access, no copied patient records and no literal passwords.
  sql(`BEGIN; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub','${actor}','role','authenticated','aal','aal1')::text,true);
SELECT public.create_lab_result_record(jsonb_build_object('patient_id','${patient}','test_name','Synthetic RC02 normal','test_value','80','test_unit','mg/dL','reference_min',50,'reference_max',100,'test_date','${today}')) FROM generate_series(1,501); COMMIT;`);
  const ranges=[];page.on('request',request=>{const url=new URL(request.url());if(url.pathname.endsWith('/lab_results'))ranges.push(url.searchParams.get('offset')||request.headers()['range']||'0');});
  await page.goto('/login');await page.locator('#email').fill(fixture.personas['nutritionist-a'].email);await page.locator('#password').fill(fixture.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page).toHaveURL(/\/nutritionist/);
  await expect(card(page)).toBeVisible();expect(ranges.some(value=>Number(value)>=500)).toBe(true);
  await card(page).getByRole('button').last().click();await page.getByRole('menuitem',{name:'Excluir alerta',exact:true}).click();await expect(card(page)).toHaveCount(0);
  const firstTask=(await client.rpc('get_my_feed_task_states')).data.find(row=>row.source_id==='lab-result:'+first.id);expect(firstTask.status).toBe('resolved');
  const second=await create(220);await refresh(page);await expect(card(page)).toBeVisible();
  const tasks=(await client.rpc('get_my_feed_task_states')).data;const secondTask=tasks.find(row=>row.source_id==='lab-result:'+second.id);expect(secondTask.status).toBe('open');expect(tasks.find(row=>row.id===firstTask.id).status).toBe('resolved');
  const args={p_values:{...secondTask,status:'snoozed',snooze_until:new Date(Date.now()+86400000).toISOString()},p_expected:secondTask.updated_at,p_action:'snoozed',p_nonce:randomUUID(),p_actor:actor};
  const snoozed=await client.rpc('save_feed_task',args);expect(snoozed.error).toBeNull();expect(snoozed.data.status).toBe('snoozed');
  const repeated=await client.rpc('save_feed_task',args);expect(repeated.error).toBeNull();expect(repeated.data.id).toBe(snoozed.data.id);
  const conflict=await client.rpc('save_feed_task',{...args,p_action:'resolved',p_nonce:randomUUID()});expect(conflict.error.code).toBe('PT409');
  await refresh(page);await expect(card(page)).toHaveCount(0);
  const revision=await client.rpc('revise_lab_result_record',{p_result_id:second.id,p_payload:payload(80),p_reason:'Correção sintética do resultado RC02'});expect(revision.error).toBeNull();
  await refresh(page);await expect(card(page)).toHaveCount(0);
  expect((await client.from('lab_results').select('is_latest_revision,test_value').eq('id',second.id).single()).data).toMatchObject({is_latest_revision:false,test_value:'220'});
  const third=await create(240);await refresh(page);await expect(card(page)).toBeVisible();
  expect((await client.rpc('invalidate_lab_result_record',{p_result_id:third.id,p_reason:'Invalidação sintética do resultado RC02'})).error).toBeNull();await refresh(page);await expect(card(page)).toHaveCount(0);
  // A denied laboratory read must clear the previous authorized snapshot.
  await create(250);await refresh(page);await expect(card(page)).toBeVisible();
  await page.route('**/rest/v1/lab_results?**',route=>route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({code:'42501',message:'Synthetic denied source'})}));
  await refreshDenied(page);await expect(card(page)).toHaveCount(0);
});
async function refreshDenied(page){await page.reload();await expect(page.getByRole('alert')).toContainText('Risco laboratorial');await expect(page.getByText('Tudo em dia!')).toHaveCount(0);}
