import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {execFileSync} from 'node:child_process';
import {totp} from '../scripts/qa/totp.mjs';
import {createAdminWorkspaceFixture} from '../scripts/qa/admin-workspace-fixture.mjs';
import {relevantDiagnostic} from '../scripts/qa/diagnostic-policy.mjs';

test('admin product analytics: real Auth, MFA and SQL with independent provider degradation and responsive controls',async({page})=>{
 test.setTimeout(150000);
 const fixture=await createAdminWorkspaceFixture();
 const diagnostics=[];page.on('pageerror',e=>diagnostics.push(e.message));page.on('console',m=>{if(relevantDiagnostic(m.type(),m.text()))diagnostics.push(m.text());});
 // Only PostHog is synthetic; SQL permissions/aggregates and MFA are real local services.
 let mode='not_configured';
 await page.route('**/functions/v1/sentry-proxy',async route=>{
  const body=route.request().postDataJSON();
  if(body.action!=='product_analytics')return route.continue();
  if(mode==='revoked')return route.fulfill({status:403,json:{error:'Admin access required'}});
  const generated_at=new Date().toISOString();
  const rows=mode==='available'?[{event:'meal_plan_published',outcome:'capture',captures:4,observed_people:2,last_observed_at:generated_at}]:[];
  const json={schema_version:1,state:mode,source:'Synthetic PostHog contract',window_days:body.window_days,generated_at,data_through:null,rows,last_observed_at:rows.length?generated_at:null};
  if(mode==='malformed')json.rows=[{event:'private_clinical_payload'}];
  return route.fulfill({json});
 });
 await page.goto('/admin/analytics');await page.locator('#email').fill(fixture.email);await page.locator('#password').fill(fixture.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await expect(page).not.toHaveURL(/\/login/);
 await page.goto('/admin/analytics');await page.locator('#admin-mfa-code').fill(totp(fixture.secret));await page.getByRole('button',{name:'Verificar e entrar',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Uso e valor confirmado'})).toBeVisible();
 for(const width of [320,390,768,1024,1440]){
  await page.setViewportSize({width,height:900});await page.goto('/admin/analytics');
  await expect(page.getByRole('heading',{name:'Uso e valor confirmado'})).toBeVisible();
  await expect(page.getByText('Definições e limites',{exact:true})).toBeVisible();
  await expect(page.getByText(/Consulta não configurada/)).toBeVisible();
  for(const days of [90,180,30]) {await page.getByRole('button',{name:`${days} dias`,exact:true}).click();await expect(page.getByRole('button',{name:`${days} dias`,exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByText('Definições e limites',{exact:true})).toBeVisible();}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  if(axe.violations.length) await test.info().attach(`accessibility-${width}`,{body:JSON.stringify(axe.violations),contentType:'application/json'});
  expect(axe.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))).toEqual([]);
 }
 mode='available';await page.goto('/admin/analytics');await expect(page.getByText('4 capturas',{exact:false})).toBeVisible();
 mode='malformed';await page.getByRole('heading',{name:'Captura consentida · PostHog'}).locator('..').locator('..').getByRole('button',{name:'Atualizar',exact:true}).click();
 await expect(page.getByText('Falha ao atualizar · última consulta preservada',{exact:true})).toBeVisible();await expect(page.getByText('4 capturas',{exact:false})).toBeVisible();
  await expect(page.getByText('Definições e limites',{exact:true})).toBeVisible();
  // Revoke the actual disposable operator while the page is open. The provider
  // boundary mirrors its denial; SQL reauthorizes against the real operator row.
  const revoke=value=>execFileSync('docker',['exec','-i','supabase_db_nello-reconstruction','psql','-X','-h','127.0.0.1','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],{input:`update private.admin_operators set revoked_at=${value} where user_id='${fixture.id}';`,stdio:['pipe','ignore','pipe']});
  try {
   mode='revoked';revoke('now()');
   for(const button of await page.getByRole('button',{name:'Atualizar',exact:true}).all())await button.click();
   await expect(page.getByText('Definições e limites',{exact:true})).toHaveCount(0);
   await expect(page.getByText('4 capturas',{exact:false})).toHaveCount(0);
   await expect(page.getByText('Fonte indisponível',{exact:true})).toHaveCount(2);
  } finally {revoke('null');}
  await page.goto('/admin/operations');await expect(page.getByRole('heading',{name:'Jornadas da plataforma'})).toBeVisible();await expect(page.getByText('Pendências operacionais',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 expect(diagnostics).toEqual([]);
});
