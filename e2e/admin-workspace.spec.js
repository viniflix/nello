import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {totp} from '../scripts/qa/totp.mjs';
import {createAdminWorkspaceFixture} from '../scripts/qa/admin-workspace-fixture.mjs';
import {relevantDiagnostic} from '../scripts/qa/diagnostic-policy.mjs';
test('admin operational briefing, roles, responsive navigation, incidents and confirmed triage',async({page})=>{
 test.setTimeout(150000);
 const fixture=await createAdminWorkspaceFixture();
 const issueId=String(Date.now());
 const diagnostics=[];page.on('pageerror',e=>diagnostics.push(e.message));page.on('console',m=>{if(relevantDiagnostic(m.type(),m.text()))diagnostics.push(m.text());});
 await page.goto('/admin/dashboard');await page.locator('#email').fill(fixture.email);await page.locator('#password').fill(fixture.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await expect(page).not.toHaveURL(/\/login/);
 await page.goto('/admin/dashboard');await page.locator('#admin-mfa-code').fill(totp(fixture.secret));await page.getByRole('button',{name:'Verificar e entrar',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Central de operação'})).toBeVisible();
 await expect(page.getByText('Consulta recente',{exact:true})).toBeVisible();
 // Only external provider responses are synthetic. Auth, MFA, briefing and triage use the real local server.
 await page.route('**/functions/v1/sentry-proxy',async route=>{
  const body=route.request().postDataJSON();
  if(body.action==='sources')return route.fulfill({json:{source:'Synthetic provider contract',generated_at:new Date().toISOString(),sources:['Supabase','Sentry','PostHog','Resend'].map(provider=>({provider,state:'not_configured',generated_at:new Date().toISOString(),reason:'Synthetic fixture; no provider call',usage:null}))}});
  if(body.action==='latest_event')return route.fulfill({json:{event_id:'synthetic-event',exceptions:[{type:'TypeError',value:'Mensagem omitida',frames:[]}]}});
  return route.fulfill({json:{items:[{id:issueId,shortId:'NELLO-QA',title:'error · TypeError',count:'2',level:'error',lastSeen:new Date().toISOString()}],next_cursor:null,generated_at:new Date().toISOString()}});
 });
 for(const width of [320,390,768,1024,1440]){
  await page.setViewportSize({width,height:900});await page.goto('/admin/dashboard');await expect(page.getByRole('heading',{name:'Central de operação'})).toBeVisible();await expect(page.getByText('Consulta recente',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(axe.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))).toEqual([]);
  if(width<1280){await page.getByRole('button',{name:'Abrir navegação administrativa'}).click();await page.getByRole('link',{name:'Integrações',exact:true}).click();}
  else{await page.getByRole('button',{name:'Operação',exact:true}).click();await page.getByRole('menuitem',{name:'Integrações',exact:true}).click();}
  await expect(page.getByRole('heading',{name:'Integrações e confiança'})).toBeVisible();await expect(page.getByText('Não configurado',{exact:true})).toHaveCount(4);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 }
 await page.setViewportSize({width:390,height:900});await page.goto('/admin/bugs');await page.getByRole('button',{name:/error · TypeError/}).click();await expect(page.getByRole('heading',{name:'Triagem interna',exact:true})).toBeVisible();
 await page.getByLabel('Evidência ou próxima ação').fill('Synthetic investigation: reproduce and verify the technical contract.');await page.getByRole('button',{name:'Registrar triagem',exact:true}).click();
 await expect(page.getByRole('listitem').filter({hasText:'Synthetic investigation: reproduce and verify the technical contract.'})).toBeVisible();
 await page.getByRole('button',{name:'Fechar',exact:true}).click();await page.getByRole('button',{name:/error · TypeError/}).click();await expect(page.getByRole('listitem').filter({hasText:'Synthetic investigation: reproduce and verify the technical contract.'})).toBeVisible();
 expect(diagnostics).toEqual([]);
});
