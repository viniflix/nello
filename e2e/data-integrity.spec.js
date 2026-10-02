import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const fixture = JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json'));
async function actor(key) {
  const client = createClient(fixture.url, fixture.anonKey, {auth:{persistSession:false,autoRefreshToken:false}});
  const result = await client.auth.signInWithPassword({email:fixture.personas[key].email,password:fixture.password});
  expect(result.error).toBeNull(); return client;
}
test('HTTP concurrent retries preserve one task and refuse stale and foreign actions', async () => {
  const owner = await test.step('Authenticate synthetic owner',()=>actor('nutritionist-a'));
  const p_actor = fixture.personas['nutritionist-a'].id;
  const args = {p_values:{nutritionist_id:p_actor,source_type:'pending',source_id:randomUUID(),title:'Synthetic integrity check'},p_expected:null,p_action:'resolved',p_nonce:randomUUID(),p_actor};
  const session=await test.step('Read local session',()=>owner.auth.getSession());
  const headers={apikey:fixture.anonKey,Authorization:`Bearer ${session.data.session.access_token}`,'Content-Type':'application/json'};
  const results = await test.step('Four concurrent HTTP requests',()=>Promise.all(Array.from({length:4},async()=>{
    const response=await fetch(`${fixture.url}/rest/v1/rpc/save_feed_task`,{method:'POST',headers,body:JSON.stringify(args),signal:AbortSignal.timeout(10000)});
    const data=await response.json();return response.ok?{data,error:null}:{data:null,error:data};
  })));
  results.forEach(result=>expect(result.error).toBeNull());
  expect(new Set(results.map(result=>result.data.id)).size).toBe(1);
  expect(results[0].data.metadata.audit_history).toHaveLength(1);
  const refreshed=await test.step('Automatic snapshot preserves resolution',()=>owner.rpc('save_feed_task',{...args,p_action:null,p_nonce:randomUUID()}));expect(refreshed.error).toBeNull();expect(refreshed.data.status).toBe('resolved');
  const stale=await test.step('Stale explicit action is refused',()=>owner.rpc('save_feed_task',{...args,p_action:'reopened',p_nonce:randomUUID(),p_expected:results[0].data.updated_at}).abortSignal(AbortSignal.timeout(5000)));expect(stale.error?.code).toBe('PT409');
  const other=await test.step('Authenticate another synthetic professional',()=>actor('nutritionist-b'));const denied=await test.step('Account-bound write is refused',()=>other.rpc('save_feed_task',args));expect(denied.error?.code).toBe('42501');
});
test('HTTP draft meal commit can be retried and invalid children never replace the original', async () => {
  const owner=await actor('nutritionist-a');const p_actor=fixture.personas['nutritionist-a'].id;
  const draft=await owner.rpc('mutate_record_idempotently',{p_table:'meal_plans',p_values:{patient_id:fixture.personas['patient-a'].id,nutritionist_id:p_actor,name:'Synthetic integrity draft',is_draft:true,is_active:false,start_date:'2026-10-01'},p_id:null,p_expected:null,p_nonce:randomUUID(),p_actor});expect(draft.error).toBeNull();
  const food=await owner.from('foods').select('id').limit(1).single();expect(food.error).toBeNull();
  const args={p_plan_id:draft.data.id,p_meal_id:null,p_meal:{name:'Synthetic lunch',meal_type:'lunch',foods:[{food_id:food.data.id,quantity:100,unit:'g',calories:100,protein:5,carbs:10,fat:3}]},p_expected:draft.data.updated_at,p_nonce:randomUUID(),p_actor};
  const first=await owner.rpc('save_draft_meal',args);expect(first.error).toBeNull();
  const retry=await owner.rpc('save_draft_meal',args);expect(retry.error).toBeNull();expect(retry.data.id).toBe(first.data.id);
  const plan=await owner.from('meal_plans').select('daily_calories,updated_at').eq('id',draft.data.id).single();expect(plan.error).toBeNull();expect(Number(plan.data.daily_calories)).toBe(100);
  const invalid=await owner.rpc('save_draft_meal',{...args,p_meal_id:first.data.id,p_nonce:randomUUID(),p_expected:plan.data.updated_at,p_meal:{...args.p_meal,name:'Invalid replacement',foods:[{food_id:'00000000-0000-0000-0000-000000000099',quantity:100,unit:'g'}]}});expect(invalid.error).not.toBeNull();
  const original=await owner.from('meal_plan_meals').select('name,total_calories').eq('id',first.data.id).single();expect(original.error).toBeNull();expect(original.data.name).toBe('Synthetic lunch');expect(Number(original.data.total_calories)).toBe(100);
});
test('offline notice is honest and reconnection retains the authenticated account', async ({page,context}) => {
  await page.goto('/login');await page.locator('#email').fill(fixture.personas['nutritionist-a'].email);await page.locator('#password').fill(fixture.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page).toHaveURL(/\/nutritionist/);
  await context.setOffline(true);await expect(page.getByRole('status').filter({hasText:'Sem conexão.'})).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('nello_offline_queue'))).toBeNull();
  await context.setOffline(false);await expect(page.getByRole('status').filter({hasText:'Sem conexão.'})).not.toBeVisible();
  await page.reload();await expect(page).toHaveURL(/\/nutritionist/);
});
