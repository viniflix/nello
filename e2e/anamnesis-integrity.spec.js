import {test,expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {readFileSync} from 'node:fs';import {execFileSync} from 'node:child_process';import {randomUUID,randomBytes} from 'node:crypto';
import {assertIsolatedRuntime,supabaseCommand,supabaseArgs} from '../scripts/qa/isolated-runtime.mjs';
import {assertSyntheticRecoveryIdentities} from '../scripts/qa/recovery-identities.mjs';
assertIsolatedRuntime();const fixture=JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json'));
if(fixture.url!=='http://localhost:54321')throw Error('Synthetic local stack required');
const owner=fixture.personas['nutritionist-a'].id,password=randomBytes(24).toString('hex')+'Aa1!';let patient,email,client,template,record;
const sql=input=>execFileSync('docker',['exec','-i','supabase_db_nello-reconstruction','psql','-X','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-t','-A'],{input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
async function login(page){await page.goto('/login');await page.locator('#email').fill(fixture.personas['nutritionist-a'].email);await page.locator('#password').fill(fixture.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page).toHaveURL(/\/nutritionist/);}
test.beforeAll(async()=>{
 const status=JSON.parse(execFileSync(supabaseCommand,supabaseArgs(['status','--workdir','.backend-ci','--output','json']),{encoding:'utf8',stdio:['pipe','pipe','pipe']}));if(status.API_URL!=='http://127.0.0.1:54321')throw Error('Local provider required');
 const admin=createClient(fixture.url,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const result=await admin.auth.admin.createUser({email:randomUUID()+'@example.invalid',password,email_confirm:true,user_metadata:{user_type:'nutritionist',name:'Synthetic RC04',legal_version:'2026-10-01.2',terms_accepted:true,analytics_allowed:false}});expect(result.error).toBeNull();patient=result.data.user.id;email=patient+'@example.invalid';expect((await admin.auth.admin.updateUserById(patient,{email,email_confirm:true})).error).toBeNull();expect(assertSyntheticRecoveryIdentities([...Object.values(fixture.personas),{id:patient,email}],fixture.personas)).toBe(10);
 sql(`UPDATE public.user_profiles SET user_type='patient',nutritionist_id='${owner}' WHERE id='${patient}';UPDATE public.professional_verifications SET status='suspended' WHERE user_id='${patient}';INSERT INTO public.nutritionist_patients(nutritionist_id,patient_id,status) VALUES('${owner}','${patient}','active');`);
 template=randomUUID();record=randomUUID();const sections=[{id:'s',title:'Synthetic RC04',fields:[{id:'a',label:'Synthetic root',type:'text'},{id:'b',label:'Synthetic parent',type:'text',conditional_logic:{field_id:'a',operator:'equals',value:'yes'}},{id:'c',label:'Synthetic child',type:'text',conditional_logic:{field_id:'b',operator:'equals',value:'yes'}}]}];
 sql(`INSERT INTO public.anamnesis_templates(id,nutritionist_id,title,sections) VALUES('${template}','${owner}','Synthetic RC04','${JSON.stringify(sections)}');INSERT INTO public.anamnesis_records(id,patient_id,nutritionist_id,template_id,status,created_at,content,template_snapshot) SELECT '${record}','${patient}','${owner}',id,'pending_patient',now()-interval '90 days','{}',jsonb_build_object('title',title,'sections',sections) FROM public.anamnesis_templates WHERE id='${template}';INSERT INTO public.anamnesis_records(patient_id,nutritionist_id,template_id,status,content,template_snapshot) SELECT '${patient}','${owner}',id,'validated','{}',jsonb_build_object('title',title,'sections',sections) FROM public.anamnesis_templates CROSS JOIN generate_series(1,61) WHERE id='${template}';`);
 client=createClient(fixture.url,fixture.anonKey,{auth:{persistSession:false,autoRefreshToken:false}});expect((await client.auth.signInWithPassword({email:fixture.personas['nutritionist-a'].email,password:fixture.password})).error).toBeNull();
});
test.afterAll(async()=>{if(client&&patient){expect((await client.rpc('end_care_episode',{p_patient_id:patient,p_end_reason:'ended_by_nutritionist'})).error).toBeNull();await client.auth.signOut();}});
test('server rejects a cyclic template without changing the prior definition',async()=>{
 const before=sql(`SELECT md5(sections::text) FROM public.anamnesis_templates WHERE id='${template}';`);
 const result=await client.from('anamnesis_templates').update({sections:[{fields:[{id:'a',conditional_logic:{field_id:'b',operator:'equals'}},{id:'b',conditional_logic:{field_id:'a',operator:'equals'}}]}]}).eq('id',template);
 expect(result.error?.code).toBe('22023');expect(result.error?.message).toContain('ANAMNESIS_INVALID_CONDITIONS');expect(sql(`SELECT md5(sections::text) FROM public.anamnesis_templates WHERE id='${template}';`)).toBe(before);
});
test('finds a pending record older than sixty completed records and offers honest clipboard recovery',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('Synthetic denied clipboard');}}}));await login(page);
 const pending=page.waitForResponse(r=>{const u=new URL(r.url());return u.pathname==='/rest/v1/anamnesis_records'&&u.searchParams.get('status')==='eq.pending_patient';});
 await page.goto(`/nutritionist/patients/${patient}/anamnese/${record}/edit`);await page.getByRole('button',{name:'Reenviar Link',exact:true}).click();const pendingResult=await pending;expect(pendingResult.ok()).toBe(true);expect((await pendingResult.json())[0].id).toBe(record);
 await page.getByRole('combobox',{name:'Validade do link'}).click();await page.getByRole('option',{name:'3 dias',exact:true}).click();await page.getByRole('button',{name:'Reenviar novo link'}).click();
 await expect(page.getByText(/Não foi possível copiar automaticamente/)).toBeVisible();await expect(page.getByText('Link copiado!',{exact:true})).toHaveCount(0);
 const saved=await client.from('anamnesis_records').select('public_access_token,token_expires_at').eq('id',record).single();expect(saved.error).toBeNull();expect(await page.getByLabel('Link do formulário').inputValue()).toContain('/f/'+saved.data.public_access_token);await expect(page.getByText('Link gerado. Expira em '+new Date(saved.data.token_expires_at).toLocaleString('pt-BR')+'.',{exact:true})).toBeVisible();
});
test('resend revokes the old token and conditional chains hide stale descendants in the public form',async({page})=>{
 const old=await client.from('anamnesis_records').select('public_access_token').eq('id',record).single();expect(old.error).toBeNull();const issued=await client.rpc('generate_anamnesis_link',{p_record_id:record,p_nutritionist_id:owner,p_expires_days:14});expect(issued.error).toBeNull();
 await page.goto('/f/'+old.data.public_access_token);await expect(page.getByText(/Link inválido|Link Inválido/).first()).toBeVisible();
 await page.goto('/f/'+issued.data.token);await expect(page.getByText('Synthetic root',{exact:true})).toBeVisible();const input=page.getByRole('textbox');await expect(input).toHaveCount(1);await input.nth(0).fill('yes');await expect(input).toHaveCount(2);await input.nth(1).fill('yes');await expect(input).toHaveCount(3);await input.nth(0).fill('no');await expect(input).toHaveCount(1);
});
