import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { assertIsolatedRuntime } from '../scripts/qa/isolated-runtime.mjs';
assertIsolatedRuntime();
const fixture=JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json'));
async function login(page) {
 await page.goto('/login');await page.locator('#email').fill(fixture.personas['nutritionist-a'].email);
 await page.locator('#password').fill(fixture.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await expect(page).toHaveURL(/\/nutritionist/);
}
async function owner() {
 const client=createClient(fixture.url,fixture.anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
 expect((await client.auth.signInWithPassword({email:fixture.personas['nutritionist-a'].email,password:fixture.password})).error).toBeNull();return client;
}
function createPatient(actor,name) {
 const patient=randomUUID();
 execFileSync('docker',['exec','-i','-e','PGPASSWORD=postgres','supabase_db_nello-reconstruction','psql','-X','-h','127.0.0.1','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],{
  input:`INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data) VALUES('${patient}','authenticated','authenticated','${patient}@example.invalid','{"name":"${name}","user_type":"patient"}');
  UPDATE public.user_profiles SET nutritionist_id='${actor}' WHERE id='${patient}';
  INSERT INTO public.nutritionist_patients(nutritionist_id,patient_id,status) VALUES('${actor}','${patient}','active');`,stdio:['pipe','ignore','pipe']});
 return patient;
}

test('feed retry really saves the failed subset and removes its warning',async({page})=>{
 test.setTimeout(90000);
 const client=await owner();
 // At least 104 missing clinical items: exceed the 100 pending-intent bound
 // independently of records left by other journeys, then confirm one manual retry.
 const patients=Array.from({length:26},(_,index)=>createPatient(fixture.personas['nutritionist-a'].id,`QA Retry ${index}`));
 try {
 let fail=true;const failed=new Set();const retried=new Set();
 const gatewayFailures=new Map();
 // Reproduce the real gateway failures seen in reconstruction. Only the first
 // read fails; the authorized retry must reach the actual local SQL service.
 for(const rpc of ['get_my_feed_task_states','get_comprehensive_activity_feed_optimized']) {
  await page.route(`**/rest/v1/rpc/${rpc}`,async route=>{
   if(!gatewayFailures.has(rpc)){gatewayFailures.set(rpc,1);return route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({message:'Synthetic gateway unavailable'})});}
   gatewayFailures.set(rpc,gatewayFailures.get(rpc)+1);await route.continue();
  });
 }
 await page.route('**/rest/v1/rpc/save_feed_task',async route=>{
  const body=route.request().postDataJSON();const key=body.p_values.source_type+':'+body.p_values.source_id;
  if(fail){failed.add(key);await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'PGRST003',message:'Synthetic transient outage'})});}
  else {retried.add(key);await route.continue();}
 });
 await login(page);
 await expect(page.getByRole('alert').filter({hasText:'alterações do feed não foram salvas'})).toBeVisible();
 expect([...gatewayFailures.values()]).toHaveLength(2);
 expect([...gatewayFailures.values()].every(attempts=>attempts>=2)).toBe(true);
 expect(failed.size).toBe(100);fail=false;
 await page.getByRole('button',{name:'Tentar salvar novamente',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'alterações do feed não foram salvas'})).toHaveCount(0);
 await expect.poll(()=>retried.size).toBeGreaterThan(100);
 await expect.poll(()=>[...failed].every(key=>retried.has(key))).toBe(true);
 const confirmed=await client.rpc('get_my_feed_task_states');expect(confirmed.error).toBeNull();
 for(const patient of patients)expect(confirmed.data.filter(row=>row.patient_id===patient&&row.source_type==='pending')).toHaveLength(4);
 } finally {
  for(const patient of patients)expect((await client.rpc('end_care_episode',{p_patient_id:patient,p_end_reason:'ended_by_nutritionist'})).error).toBeNull();
  await client.auth.signOut();
 }
});

test('archive with an open dashboard removes ghosts; restart rejects old writes and preserves history',async({page})=>{
 const client=await owner();const actor=fixture.personas['nutritionist-a'].id;
 const name=`QA-Lifecycle-${randomUUID().slice(0,8)}`;const patient=createPatient(actor,name);
 const scope=await client.rpc('get_active_feed_patients');expect(scope.error).toBeNull();
 const episode=scope.data.find(row=>row.id===patient).care_episode_id;
 await login(page);await expect(page.locator('article').filter({hasText:name}).first()).toBeVisible();
 const old=(await client.rpc('get_my_feed_task_states')).data.filter(row=>row.patient_id===patient);expect(old.length).toBeGreaterThan(0);
 const args={p_values:{nutritionist_id:actor,patient_id:patient,source_type:'pending',source_id:'race-'+patient,title:'Synthetic archive race',metadata:{care_episode_id:episode}},p_action:null,p_expected:null,p_actor:actor,p_nonce:randomUUID()};
 const results=await Promise.all([client.rpc('end_care_episode',{p_patient_id:patient,p_end_reason:'ended_by_nutritionist'}),
  ...Array.from({length:4},()=>client.rpc('save_feed_task',args))]);results.forEach(result=>expect(result.error).toBeNull());
 await expect(page.locator('article').filter({hasText:name})).toHaveCount(0);
 expect((await client.rpc('get_my_feed_task_states')).data.some(row=>row.patient_id===patient)).toBe(false);
 await page.goto('/nutritionist/patients');
 await page.getByRole('button',{name:/Ver Arquivados/}).click();
 await page.getByRole('button',{name:`Reativar acompanhamento de ${name}`,exact:true}).click();
 await page.getByRole('button',{name:'Confirmar reativação',exact:true}).click();
 await expect(page.getByRole('button',{name:`Ações de ${name}`,exact:true})).toHaveCount(0);
 await page.goto('/nutritionist');
 await expect(page.locator('article').filter({hasText:name}).first()).toBeVisible();
 const late=await client.rpc('save_feed_task',{...args,p_action:'resolved',p_nonce:randomUUID()});
 expect(late.error).toBeNull();expect(late.data.no_longer_applicable).toBe(true);
 const current=(await client.rpc('get_my_feed_task_states')).data.filter(row=>row.patient_id===patient);
 expect(current.length).toBeGreaterThan(0);expect(current.every(row=>row.status==='open' && !old.some(prior=>prior.id===row.id))).toBe(true);
 const historical=await client.from('feed_tasks').select('id,is_current').in('id',old.map(row=>row.id));
 expect(historical.error).toBeNull();expect(historical.data).toHaveLength(old.length);expect(historical.data.every(row=>!row.is_current)).toBe(true);
 await expect(page.getByRole('alert').filter({hasText:'alterações do feed não foram salvas'})).toHaveCount(0);
 expect((await client.rpc('end_care_episode',{p_patient_id:patient,p_end_reason:'ended_by_nutritionist'})).error).toBeNull();
 await client.auth.signOut();
});
