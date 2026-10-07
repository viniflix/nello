import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {totp} from '../scripts/qa/totp.mjs';
import {createAdminWorkspaceFixture} from '../scripts/qa/admin-workspace-fixture.mjs';

test('private support: real Auth/MFA, case, note, triage, reviewed intent and responsive controls',async({page})=>{
 test.setTimeout(150000);
 const fixture=await createAdminWorkspaceFixture();const title='Synthetic support '+Date.now();const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 // Provider availability only is synthetic. Case persistence and permissions use local SQL.
 await page.route('**/functions/v1/admin-support',async route=>{
  const body=route.request().postDataJSON();
  if(body.action!=='status')throw Error('Unexpected external operation in synthetic browser journey');
  return route.fulfill({json:{configured:false,webhook_configured:false,source:'Synthetic unavailable provider',generated_at:new Date().toISOString(),delivery_verified:false}});
 });
 await page.goto('/admin/support');await page.locator('#email').fill(fixture.email);await page.locator('#password').fill(fixture.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page).not.toHaveURL(/\/login/);
 await page.goto('/admin/support');await page.locator('#admin-mfa-code').fill(totp(fixture.secret));await page.getByRole('button',{name:'Verificar e entrar',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Atendimento e feedback'})).toBeVisible();
 // A transport failure closes the workspace; recovery still uses real Auth/MFA and RPC.
 await page.route('**/rest/v1/rpc/admin_access_status',route=>route.fulfill({status:503,json:{message:'Synthetic transient outage'}}),{times:1});
 await page.reload();await expect(page.getByRole('alert')).toContainText('não pôde ser validada');
 await expect(page.getByRole('heading',{name:'Atendimento e feedback'})).not.toBeVisible();
 await page.getByRole('button',{name:'Validar acesso novamente'}).click();
 await expect(page.getByRole('heading',{name:'Atendimento e feedback'})).toBeVisible();
 await page.getByRole('button',{name:'Novo caso',exact:true}).click();await page.getByLabel('Assunto',{exact:true}).fill(title);await page.getByLabel('E-mail de contato').fill('qa@example.invalid');await page.getByRole('button',{name:'Criar atendimento',exact:true}).click();
 await expect(page.getByRole('heading',{name:title})).toBeVisible();
 await page.getByLabel('Nota interna',{exact:true}).fill('Synthetic private note: never sent.');await page.getByRole('button',{name:'Registrar nota',exact:true}).click();await expect(page.getByText('Synthetic private note: never sent.',{exact:true})).toBeVisible();
 await page.getByLabel('Situação',{exact:true}).selectOption('in_progress');await page.getByLabel('Categoria',{exact:true}).selectOption('bug');await page.getByLabel('Motivo da alteração').fill('Synthetic investigation with preserved history.');await page.getByRole('button',{name:'Registrar triagem',exact:true}).click();await expect(page.getByText('Synthetic investigation with preserved history.',{exact:true})).toBeVisible();
 await page.getByLabel('Destino do texto').selectOption('outgoing');await page.getByLabel('Texto da resposta').fill('Synthetic response prepared but not sent.');await page.getByRole('button',{name:'Preparar resposta',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('qa@example.invalid');await page.getByRole('button',{name:'Confirmar preparação',exact:true}).click();await expect(page.getByText('Preparada · não enviada',{exact:true})).toBeVisible();
 await page.getByLabel('Texto da resposta').fill('Keep this unsaved text during refresh.');
 await page.getByLabel('Filtrar atendimento').selectOption('in_progress');await expect(page.getByLabel('Texto da resposta')).toHaveValue('Keep this unsaved text during refresh.');
 for(const width of [320,390,768,1024,1440]){
  await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  if(width<640){const row=page.getByRole('button').filter({hasText:title});const bounds=await row.boundingBox();const subjectBounds=await row.locator('strong').boundingBox();expect(subjectBounds.width).toBeGreaterThanOrEqual(bounds.width-35);}
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))).toEqual([]);
  await page.screenshot({path:`.backend-ci/browser-results/support-${width}.jpg`,fullPage:true});
 }
 await page.reload();await expect(page.getByRole('button').filter({hasText:title})).toBeVisible();await page.getByRole('button').filter({hasText:title}).click();await expect(page.getByText('Synthetic private note: never sent.',{exact:true})).toBeVisible();await expect(page.getByText('Preparada · não enviada',{exact:true})).toBeVisible();expect(errors).toEqual([]);
});
