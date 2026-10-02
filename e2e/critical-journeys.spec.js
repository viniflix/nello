import { test, expect } from '@playwright/test';
import { totp } from '../scripts/qa/totp.mjs';
import { relevantDiagnostic } from '../scripts/qa/diagnostic-policy.mjs';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const fixture=JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json'));
async function login(page,key){await page.goto(key.startsWith('admin-')?'/admin/dashboard':'/login');await page.locator('#email').fill(fixture.personas[key].email);await page.locator('#password').fill(fixture.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();}
async function audit(page){await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});const {violations}=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,html:n.html,summary:n.failureSummary}))}))).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);}
test('anonymous protected routes redirect to login; keyboard login is usable',async({page})=>{
  await page.goto('/nutritionist/patients');await expect(page).toHaveURL(/\/login/);await page.locator('#email').focus();await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Esqueceu a senha?',exact:true})).toBeFocused();await page.keyboard.press('Tab');await expect(page.locator('#password')).toBeFocused();await audit(page);
});
for(const [key,route] of [['nutritionist-a','/nutritionist'],['nutritionist-b','/nutritionist'],['nutritionist-pending','/nutritionist'],['patient-a','/patient'],['patient-b','/patient'],['patient-unlinked','/patient']]){
 test(`real Auth login and role boundary: ${key}`,async({page})=>{await login(page,key);await expect(page).toHaveURL(new RegExp(route));await expect(page.locator('#root')).not.toBeEmpty();if(key.startsWith('patient')){await page.goto('/nutritionist/patients');await expect(page).toHaveURL(/\/patient/);}});
}
test('disabled account is refused by actual Auth',async({page})=>{await login(page,'disabled');await expect(page.getByText('Erro',{exact:true})).toBeVisible();await expect(page).toHaveURL(/\/login/);});
test('admin without MFA cannot enter privileged panel',async({page})=>{await login(page,'admin-aal1');await expect(page.getByText('Acesso administrativo protegido',{exact:true})).toBeVisible();});
for(const viewport of [{width:390,height:844},{width:768,height:1024},{width:1440,height:1000}]){
 test(`clinical screens accessibility and layout ${viewport.width}`,async({page})=>{
  // Pin the synthetic peer to offline for stable visual baselines; protocol
  // presence/TTL and two-tab behavior are verified separately over real sockets.
  execFileSync('docker',['exec','-i','-e','PGPASSWORD=postgres','supabase_db_nello-reconstruction','psql','-X','-h','127.0.0.1','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],{input:`delete from private.chat_presence_leases where actor_id='${fixture.personas['patient-a'].id}';`,stdio:['pipe','ignore','pipe']});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(relevantDiagnostic(message.text()))errors.push(message.text());});
  await page.setViewportSize(viewport);await login(page,'nutritionist-a');await expect(page).toHaveURL(/\/nutritionist/);
  for(const module of ['hub','energy-expenditure','meal-plan','anamnese']){await page.goto(`/nutritionist/patients/${fixture.personas['patient-a'].id}/${module}`);await expect(page.locator('main')).toBeVisible();if(['hub','energy-expenditure'].includes(module))await expect(page.getByText('QA patient-a',{exact:false}).first()).toBeVisible();else await expect(page.getByRole('heading',{name:module==='meal-plan'?'Planos Alimentares':'Prontuário & Histórico'}).first()).toBeVisible();await audit(page);await expect(page).toHaveScreenshot(`${module}-${viewport.width}.png`,{fullPage:true,animations:'disabled',maxDiffPixelRatio:0.002});}
  expect(errors).toEqual([]);
 });
}
test('slow reads and temporary network loss preserve the session and recover',async({page,context})=>{
 await login(page,'nutritionist-a');await expect(page).toHaveURL(/\/nutritionist/);await page.route('**/rest/v1/**',async route=>{await new Promise(r=>setTimeout(r,350));await route.continue();});await page.goto('/nutritionist/patients');await expect(page.locator('main')).toBeVisible();await context.setOffline(true);await expect(page.locator('#root')).not.toBeEmpty();await context.setOffline(false);await page.reload();await expect(page).toHaveURL(/\/nutritionist\/patients/);await expect(page.getByText('QA patient-a',{exact:false}).first()).toBeVisible();
});

test('actual MFA enrollment and verification unlock only the eligible operator',async({page})=>{
 await login(page,'admin-aal2');await expect(page.getByText('Acesso administrativo protegido')).toBeVisible();
 await page.getByRole('button',{name:'Configurar autenticador',exact:true}).click();const manual=page.getByText(/Chave manual:/);await expect(manual).toBeVisible();const secret=await manual.locator('span').textContent();
 await page.locator('#admin-mfa-code').fill(totp(secret.trim()));await page.getByRole('button',{name:'Verificar e entrar',exact:true}).click();await expect(page.getByText('Acesso administrativo protegido')).not.toBeVisible();await expect(page.locator('main')).toBeVisible();
});
