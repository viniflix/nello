import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import AxeBuilder from '@axe-core/playwright';
const fixture=JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json'));
const sql=input=>execFileSync('docker',['exec','-i','-e','PGPASSWORD=postgres','supabase_db_nello-reconstruction','psql','-X','-h','127.0.0.1','-U','supabase_admin','-d','postgres','-t','-A','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8'}).trim();
async function login(page,key='nutritionist-a'){
 await page.goto('/login');await page.locator('#email').fill(fixture.personas[key].email);await page.locator('#password').fill(fixture.password);
 await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page).toHaveURL(/\/nutritionist/);
}
test('malformed public document code never reaches the UUID RPC',async({page})=>{
 let requests=0;await page.route('**/rest/v1/rpc/verify_document_authenticity**',route=>{requests++;return route.continue();});
 await page.goto('/verificar-documento/BUGHUNT-INVALID-20260905');
 await expect(page.getByText('Documento não encontrado',{exact:true})).toBeVisible();expect(requests).toBe(0);
});
test('measure load failure recovers, creation persists, and another account never sees the measure',async({page})=>{
 await login(page);let fail=true;
 await page.route('**/rest/v1/nutritionist_custom_measures?**',route=>fail&&route.request().method()==='GET'?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'PRIVATE_SENTINEL',code:'PGRST000'})}):route.continue());
 await page.goto('/nutritionist/templates?group=measures');await expect(page.getByRole('alert')).toContainText('Não foi possível carregar suas medidas');
 await expect(page.getByRole('alert')).not.toContainText('PRIVATE_SENTINEL');
 const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))).toEqual([]);
 fail=false;await page.getByRole('button',{name:'Tentar carregar novamente'}).click();await expect(page.getByRole('alert').filter({hasText:'Não foi possível carregar suas medidas'})).toHaveCount(0);
 await page.getByRole('button',{name:'Nova Medida',exact:true}).click();await page.locator('#cm-name').fill('QA observability spoon');await page.locator('#cm-grams').fill('12.5');
 await page.getByRole('button',{name:'Criar Medida',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.reload();await expect(page.getByText('QA observability spoon',{exact:true})).toBeVisible();
 const other=await page.context().browser().newContext();const peer=await other.newPage();await peer.goto(new URL('/login',page.url()).href);
 await peer.locator('#email').fill(fixture.personas['nutritionist-b'].email);await peer.locator('#password').fill(fixture.password);await peer.getByRole('button',{name:'Entrar',exact:true}).click();await expect(peer).toHaveURL(/\/nutritionist/);
 await peer.goto(new URL('/nutritionist/templates?group=measures',page.url()).href);await expect(peer.getByRole('button',{name:'Nova Medida',exact:true})).toBeVisible();await expect(peer.getByText('QA observability spoon',{exact:true})).toHaveCount(0);await other.close();
});
test('anamnesis creation waits for the patient slug and saves a supported final state',async({page})=>{
 const patient=fixture.personas['patient-a'].id,owner=fixture.personas['nutritionist-a'].id;
 const template='30000000-0000-0000-0000-000000000091';
 sql(`insert into public.anamnesis_templates(id,nutritionist_id,title,sections,is_system_default,is_active) values('${template}','${owner}','QA observability form','[{"id":"routine","title":"Rotina","fields":[{"id":"habits","label":"Rotina alimentar","type":"textarea","required":true}]}]'::jsonb,false,true) on conflict(id) do nothing;`);
 const slug=sql(`select slug from public.user_profiles where id='${patient}';`);expect(slug).toBeTruthy();
 await login(page);const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const failures=[];page.on('response',response=>{if(response.url().includes('/rpc/mutate_record_idempotently')&&response.status()>=400)failures.push(response.status());});
 await page.route('**/rest/v1/user_profiles?**',async route=>{if(route.request().url().includes('slug=eq.'))await new Promise(resolve=>setTimeout(resolve,500));await route.continue();});
 await page.goto(`/nutritionist/patients/${slug}/anamnese/new?templateId=${template}`);
 await page.getByLabel('Rotina alimentar').fill('Synthetic routine');
 // Audit the stable form after Radix removes its transient focus proxies.
 await expect(page.getByText('Você pode começar a preencher a anamnese.',{exact:true})).toHaveCount(0);
 const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))).toEqual([]);
 await page.getByRole('button',{name:'Finalizar Anamnese',exact:true}).click();
 await expect(page.getByRole('button',{name:'Finalizar Anamnese',exact:true})).toHaveCount(0);
 expect(sql(`select status from public.anamnesis_records where patient_id='${patient}' and template_id='${template}' order by created_at desc limit 1;`)).toBe('validated');
 expect(failures).toEqual([]);expect(errors).toEqual([]);
});
