import {test,expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {readFileSync} from 'node:fs';import {execFileSync} from 'node:child_process';import {randomBytes,randomUUID} from 'node:crypto';
import {assertSyntheticRecoveryIdentities} from '../scripts/qa/recovery-identities.mjs';
import {assertIsolatedRuntime,supabaseCommand,supabaseArgs} from '../scripts/qa/isolated-runtime.mjs';
assertIsolatedRuntime();
const fixture=JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json'));
if(!['http://localhost:54321','http://localhost:4180'].includes(fixture.url))throw Error('Loopback synthetic QA required');
const owner=fixture.personas['nutritionist-a'].id,password=randomBytes(24).toString('hex')+'Aa1!';
let email=randomUUID()+'@example.invalid';
const sql=input=>execFileSync('docker',['exec','-i','supabase_db_nello-reconstruction','psql','-X','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-t','-A'],{input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
let patient,patientClient;
const sessions=[];
function session({type='scale_1_10',mode='higher_better',status='pending',version=2,name='Synthetic RC03',minutes=60}={}){
 const template=randomUUID(),field=randomUUID(),id=randomUUID();
 sql(`INSERT INTO public.checkin_templates(id,nutritionist_id,name,frequency) VALUES('${template}','${owner}','${name}','weekly');
 INSERT INTO public.checkin_fields(id,template_id,label,field_type,score_weight,scoring_rule,is_required) VALUES('${field}','${template}','Pergunta sintética RC03','${type}',1,'{"version":2,"mode":"${mode}"}',true);
 INSERT INTO public.checkin_sessions(id,template_id,patient_id,nutritionist_id,status,score_version,expires_at,fields_snapshot) SELECT '${id}','${template}','${patient}','${owner}','${status}',${version},now()+interval '${minutes} minutes',jsonb_agg(to_jsonb(f)) FROM public.checkin_fields f WHERE template_id='${template}';`);
 sessions.push(id);return{id,field,template};
}
async function login(page,role='patient'){
 await page.goto('/login');await page.locator('#email').fill(role==='patient'?email:fixture.personas['nutritionist-a'].email);await page.locator('#password').fill(role==='patient'?password:fixture.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page).toHaveURL(role==='patient'?/\/patient/:/\/nutritionist/);
}
test.beforeAll(async()=>{
 const status=JSON.parse(execFileSync(supabaseCommand,supabaseArgs(['status','--workdir','.backend-ci','--output','json']),{encoding:'utf8',stdio:['pipe','pipe','pipe']}));
 const url=new URL(status.API_URL);if(!['localhost','127.0.0.1'].includes(url.hostname)||url.port!==new URL(fixture.url).port)throw Error('Wrong local provider');
 const admin=createClient(fixture.url,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const result=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{user_type:'nutritionist',name:'Synthetic RC03',legal_version:'2026-10-01.2',terms_accepted:true,analytics_allowed:false}});expect(result.error).toBeNull();patient=result.data.user.id;email=patient+'@example.invalid';
 const registered=await admin.auth.admin.updateUserById(patient,{email,email_confirm:true});expect(registered.error).toBeNull();
 expect(assertSyntheticRecoveryIdentities([...Object.values(fixture.personas),{id:patient,email}],fixture.personas)).toBe(10);
 sql(`UPDATE public.user_profiles SET user_type='patient',nutritionist_id='${owner}' WHERE id='${patient}';UPDATE public.professional_verifications SET status='suspended' WHERE user_id='${patient}';INSERT INTO public.nutritionist_patients(nutritionist_id,patient_id,status) VALUES('${owner}','${patient}','active');`);
 patientClient=createClient(fixture.url,fixture.anonKey,{auth:{persistSession:false,autoRefreshToken:false}});expect((await patientClient.auth.signInWithPassword({email,password})).error).toBeNull();
});
test.afterAll(async()=>{
 if(patient){const client=createClient(fixture.url,fixture.anonKey,{auth:{persistSession:false,autoRefreshToken:false}});expect((await client.auth.signInWithPassword({email:fixture.personas['nutritionist-a'].email,password:fixture.password})).error).toBeNull();expect((await client.rpc('end_care_episode',{p_patient_id:patient,p_end_reason:'ended_by_nutritionist'})).error).toBeNull();await client.auth.signOut();await patientClient.auth.signOut();}
});
test('expired status and expiry on an open page never show submitted answers',async({page})=>{
 const expired=session({status:'expired'}),pending=session({minutes:1});await login(page);
 await page.goto('/patient/checkin/'+expired.id);await expect(page.getByText('Check-in expirado',{exact:true})).toBeVisible();await expect(page.getByText(/respostas foram enviadas/)).toHaveCount(0);
 await page.clock.install();await page.goto('/patient/checkin/'+pending.id);await expect(page.getByText('Pergunta sintética RC03',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Finalizar Check-in'})).toBeDisabled();
 await page.clock.fastForward(61000);await expect(page.getByText('Check-in expirado',{exact:true})).toBeVisible();await expect(page.getByText(/respostas foram enviadas/)).toHaveCount(0);
});
test('explicit scale, symptom and descriptive answers preserve versioned scores in both portals',async({page})=>{
 const scale=session({name:'Synthetic RC03 scale'}),symptom=session({type:'yes_no',mode:'no',name:'Synthetic RC03 symptom'}),descriptive=session({type:'text',mode:'none',name:'Synthetic RC03 descriptive'});
 await login(page);await page.goto('/patient/checkin/'+scale.id);await expect(page.getByRole('button',{name:'Finalizar Check-in'})).toBeDisabled();await page.getByRole('button',{name:'Confirmar valor 5'}).click();await page.getByRole('button',{name:'Finalizar Check-in'}).click();await expect(page.getByText(/Check-in Concluído/)).toBeVisible();
 const first=await patientClient.from('checkin_sessions').select('adherence_percentage,score_version,responses').eq('id',scale.id).single();expect(first.error).toBeNull();expect(first.data.score_version).toBe(2);expect(Number(first.data.adherence_percentage)).toBeCloseTo(400/9,8);expect(first.data.responses[scale.field]).toEqual([5]);
 await page.goto('/patient/checkin/'+symptom.id);await page.getByRole('button',{name:'Não',exact:true}).click();await page.getByRole('button',{name:'Finalizar Check-in'}).click();await expect(page.getByText(/Check-in Concluído/)).toBeVisible();
 await page.goto('/patient/checkin/'+descriptive.id);await page.getByRole('textbox').fill('Synthetic descriptive response');await page.getByRole('button',{name:'Finalizar Check-in'}).click();await expect(page.getByText(/Check-in Concluído/)).toBeVisible();
 const result=await patientClient.from('checkin_sessions').select('id,adherence_percentage').in('id',[symptom.id,descriptive.id]);expect(result.error).toBeNull();expect(Number(result.data.find(row=>row.id===symptom.id).adherence_percentage)).toBe(100);expect(result.data.find(row=>row.id===descriptive.id).adherence_percentage).toBeNull();
 await page.goto('/patient/progresso');await expect(page.getByText('Sem pontuação',{exact:true}).first()).toBeVisible();await expect(page.getByText('44%',{exact:true})).toBeVisible();
 const context=await page.context().browser().newContext({baseURL:'http://localhost:4173'}),nutri=await context.newPage();try{await login(nutri,'nutritionist');await nutri.goto('/nutritionist/patients/'+patient+'/hub?tab=checkins');await expect(nutri.getByText('Sem pontuação',{exact:true}).first()).toBeVisible();await expect(nutri.getByText('44%',{exact:true})).toBeVisible();await expect(nutri.getByText('Média dos critérios definidos',{exact:true})).toBeVisible();}finally{await context.close();}
});
test('concurrent submit completes once and an old episode cannot submit after restart',async()=>{
 const concurrent=session({type:'yes_no',mode:'yes'}),stale=session({type:'yes_no',mode:'yes'});
 const before=Number(sql(`SELECT checkin_streak_current FROM public.nutritionist_patients WHERE patient_id='${patient}' AND nutritionist_id='${owner}';`));
 const responses={[concurrent.field]:'yes'};
 const results=await Promise.all([patientClient.rpc('submit_checkin_session',{p_session_id:concurrent.id,p_responses:responses}),patientClient.rpc('submit_checkin_session',{p_session_id:concurrent.id,p_responses:responses})]);
 expect(results.filter(result=>!result.error)).toHaveLength(1);expect(results.find(result=>result.error).error.message).toContain('CHECKIN_ALREADY_COMPLETED');
 const after=Number(sql(`SELECT checkin_streak_current FROM public.nutritionist_patients WHERE patient_id='${patient}' AND nutritionist_id='${owner}';`));expect(after).toBe(before+1);
 const client=createClient(fixture.url,fixture.anonKey,{auth:{persistSession:false,autoRefreshToken:false}});expect((await client.auth.signInWithPassword({email:fixture.personas['nutritionist-a'].email,password:fixture.password})).error).toBeNull();
 const wrongActor=await client.rpc('submit_checkin_session',{p_session_id:stale.id,p_responses:{[stale.field]:'yes'}});expect(wrongActor.error.code).toBe('42501');
 expect((await client.rpc('end_care_episode',{p_patient_id:patient,p_end_reason:'ended_by_nutritionist'})).error).toBeNull();expect((await client.rpc('start_care_episode',{p_patient_id:patient,p_start_reason:'restarted_by_nutritionist'})).error).toBeNull();
 const rejected=await patientClient.rpc('submit_checkin_session',{p_session_id:stale.id,p_responses:{[stale.field]:'yes'}});expect(rejected.error.code).toBe('42501');expect(sql(`SELECT status FROM public.checkin_sessions WHERE id='${stale.id}';`)).toBe('pending');await client.auth.signOut();
});
test('nutritionist configures an explicit criterion and the atomic template RPC persists it',async({page})=>{
 await login(page,'nutritionist');await page.goto('/nutritionist/templates/checkins/new');
 await page.getByPlaceholder('Ex: Relato Semanal de Adesão').fill('QA RC03 criterion '+randomUUID().slice(0,8));
 await page.getByText('Escala 1 a 10',{exact:true}).click();await page.getByRole('option',{name:'Sim ou Não',exact:true}).click();
 await page.getByRole('combobox',{name:'Critério da pergunta 1'}).click();await page.getByRole('option',{name:'Resposta “Não” atende ao critério',exact:true}).click();
 await page.getByRole('spinbutton').fill('2');
 const saved=page.waitForResponse(response=>new URL(response.url()).pathname==='/rest/v1/rpc/save_checkin_template'&&response.request().method()==='POST');await page.getByRole('button',{name:'Salvar Check-in',exact:true}).click();
 const response=await saved;expect(response.ok()).toBe(true);const id=await response.json();expect(id).toMatch(/^[a-f0-9-]{36}$/);
 await expect(page).toHaveURL(/\/nutritionist\/templates\?/);
 const record=sql(`SELECT scoring_rule->>'mode'||':'||score_weight::text FROM public.checkin_fields WHERE template_id='${id}';`);expect(record).toBe('no:2');
});

test('legacy template with a null criterion saves without changing an issued v1 result',async({page})=>{
 const legacy=session({type:'yes_no',mode:'none',name:'Synthetic RC03 legacy null'});
 sql(`UPDATE public.checkin_fields SET scoring_rule=NULL WHERE id='${legacy.field}';UPDATE public.checkin_sessions SET score_version=1,fields_snapshot=(SELECT jsonb_agg(to_jsonb(f)) FROM public.checkin_fields f WHERE template_id='${legacy.template}') WHERE id='${legacy.id}';`);
 const sent=await patientClient.rpc('submit_checkin_session',{p_session_id:legacy.id,p_responses:{[legacy.field]:'yes'}});expect(sent.error).toBeNull();expect(Number(sent.data)).toBe(100);
 const before=sql(`SELECT md5(to_jsonb(c)::text) FROM public.checkin_sessions c WHERE id='${legacy.id}';`);
 await login(page,'nutritionist');await page.goto('/nutritionist/templates/checkins/'+legacy.template+'/edit');
 await expect(page.getByRole('combobox',{name:'Critério da pergunta 1'})).toHaveText('Descritiva — sem pontuação');
 await page.getByPlaceholder('Ex: Relato Semanal de Adesão').fill('Synthetic RC03 legacy renamed');
 const saved=page.waitForResponse(response=>new URL(response.url()).pathname==='/rest/v1/rpc/save_checkin_template'&&response.request().method()==='POST');await page.getByRole('button',{name:'Salvar Check-in',exact:true}).click();const response=await saved;expect(response.ok()).toBe(true);
 await expect(page).toHaveURL(/\/nutritionist\/templates\?/);
 expect(sql(`SELECT scoring_rule->>'mode' FROM public.checkin_fields WHERE id='${legacy.field}';`)).toBe('none');
 expect(sql(`SELECT md5(to_jsonb(c)::text) FROM public.checkin_sessions c WHERE id='${legacy.id}';`)).toBe(before);
});
