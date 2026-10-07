import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {totp} from '../scripts/qa/totp.mjs';
import {createAdminWorkspaceFixture} from '../scripts/qa/admin-workspace-fixture.mjs';

test('intelligence workspace: real MFA, decision review, immutable history, capacity, lifecycle and responsive sources',async({page})=>{
 test.setTimeout(150000);
 let providerState='not_configured';
 const fixture=await createAdminWorkspaceFixture(), title=`Synthetic intelligence ${Date.now()}`, errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 // Only the external provider is simulated; authorization, records and history use real local SQL.
 await page.route('**/functions/v1/sentry-proxy',async route=>{
  const action=route.request().postDataJSON().action;
  const base={schema_version:1,source:'Synthetic unconfigured source',generated_at:new Date().toISOString(),data_through:null,state:'not_configured'};
  if(action==='releases')return route.fulfill({json:{...base,items:[],next_cursor:null,omitted:0}});
  if(action==='continuity'){
   if(providerState==='failure')return route.fulfill({status:502,json:{error:'Synthetic source failure'}});
   if(providerState==='available'){const now=new Date().toISOString();return route.fulfill({json:{...base,state:'available',data_through:now,assessment:{availabilityPercent:99.9,windows:Object.fromEntries([5,30,60,360].map(n=>[n,{covered:true,samples:n+1,burnRate:0}])),alerts:[],fresh:true,coverageGap:false,assessedAt:now,latestCheckAt:now,state:'covered'}}});}
   return route.fulfill({json:{...base,assessment:null}});
  }
  throw Error('Unexpected provider operation');
 });
 await page.goto('/admin/intelligence');await page.locator('#email').fill(fixture.email);await page.locator('#password').fill(fixture.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page).not.toHaveURL(/\/login/);
 await page.goto('/admin/intelligence');await page.locator('#admin-mfa-code').fill(totp(fixture.secret));await page.getByRole('button',{name:'Verificar e entrar',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Inteligência operacional',exact:true})).toBeVisible();
 const areas=page.getByRole('navigation',{name:'Áreas de inteligência operacional'});
 await areas.getByRole('button',{name:'Decisões',exact:true}).click();await page.getByRole('button',{name:'Registrar decisão',exact:true}).click();
 await page.getByLabel('Título',{exact:true}).fill(title);await page.getByLabel('Evidência observada',{exact:true}).fill('Synthetic evidence, no patient content.');await page.getByLabel('Ação adotada ou planejada').fill('Investigate the synthetic fixture.');await page.getByLabel('Resultado esperado').fill('An observable synthetic outcome.');
 await page.getByLabel('Data de revisão',{exact:true}).fill('2026-01-01');await page.getByLabel('Motivo deste registro ou alteração').fill('Synthetic administrative creation.');await page.getByRole('button',{name:'Salvar registro',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
 let card=page.locator('section').getByText(title,{exact:true}).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")]');
 await expect(card).toContainText('Revisão pendente');await card.getByRole('button',{name:'Histórico',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Synthetic administrative creation.');await page.keyboard.press('Escape');
 await areas.getByRole('button',{name:'Prioridades',exact:true}).click();
 const signal=page.getByText('Decisões aguardando revisão',{exact:true}).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")]');await expect(signal).toContainText('Precisa de revisão');
 await signal.getByRole('button',{name:'Gerenciar silêncio'}).click();await page.getByRole('dialog').getByLabel('Motivo do silêncio ou reativação').fill('Synthetic temporary silence to inspect deduplication.');await page.getByRole('dialog').getByRole('button',{name:'Confirmar',exact:false}).click();await expect(page.getByRole('dialog')).not.toBeVisible();await expect(signal).toContainText('Silenciado temporariamente');
 await areas.getByRole('button',{name:'Decisões',exact:true}).click();await card.getByRole('button',{name:'Revisar registro'}).click();await page.getByLabel('Resultado da revisão').selectOption('inconclusive');await page.getByLabel('O que foi observado na revisão').fill('Insufficient evidence; no inferred improvement.');await page.getByLabel('Motivo deste registro ou alteração').fill('Synthetic inconclusive review.');await page.getByRole('button',{name:'Salvar registro',exact:true}).click();await expect(card).toContainText('Inconclusivo');
 await page.reload();await expect(card).toContainText('Inconclusivo');await card.getByRole('button',{name:'Histórico',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Versão 2');await expect(page.getByRole('dialog')).toContainText('Synthetic administrative creation.');await page.keyboard.press('Escape');
 await areas.getByRole('button',{name:'Capacidade',exact:true}).click();await page.getByRole('button',{name:'Registrar medição'}).click();await page.getByLabel('Recurso medido').fill(title+' storage');await page.getByLabel('Uso medido').fill('0');await page.getByLabel('Unidade',{exact:true}).fill('bytes');await page.getByLabel('Fonte e escopo da medição').fill('Synthetic measured storage; no declared quota.');await page.getByLabel('Motivo deste registro ou alteração').fill('Synthetic measured zero with unknown cost.');await page.getByRole('button',{name:'Salvar registro',exact:true}).click();const capacityCard=page.getByText('Supabase · '+title+' storage',{exact:true}).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")]');await expect(capacityCard).toContainText('Limite não informado');await expect(capacityCard).toContainText('Custo: Não informado');
 await areas.getByRole('button',{name:'Funcionalidades',exact:true}).click();await page.getByRole('button',{name:'Registrar funcionalidade'}).click();await page.getByLabel('Nome da funcionalidade').fill(title+' feature');await page.getByLabel('Identificador estável').fill('synthetic_'+Date.now());await page.getByLabel('Escopo e público').fill('Synthetic users in isolated QA only.');await page.getByLabel('Justificativa e evidência').fill('Synthetic lifecycle inventory test.');await page.getByLabel('Motivo deste registro ou alteração').fill('Synthetic lifecycle creation.');await page.getByRole('button',{name:'Salvar registro',exact:true}).click();await expect(page.getByText(title+' feature',{exact:true}).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")]')).toContainText('Etapa declarada:');
 for(const width of [320,390,768,1024,1440]){
  await page.setViewportSize({width,height:900});
  for(const name of ['Prioridades','Decisões','Mudanças','Capacidade','Funcionalidades','Continuidade']){
   await areas.getByRole('button',{name,exact:true}).click();
   await expect(page.getByRole('heading',{name:({Prioridades:'Solicitações de privacidade vencidas',Decisões:'Decisões',Mudanças:'Mudanças',Capacidade:'Capacidade e custo',Funcionalidades:'Ciclo de vida das funcionalidades',Continuidade:'Cobertura do monitor independente'})[name],exact:true})).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   expect(await page.locator('main button').evaluateAll(nodes=>nodes.filter(n=>n.scrollWidth>n.clientWidth+1).map(n=>n.textContent))).toEqual([]);
   expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>({target:n.target,details:n.failureSummary}))}))).toEqual([]);
   if([320,768,1440].includes(width))await page.screenshot({path:`.backend-ci/browser-results/intelligence-${name}-${width}.jpg`,fullPage:true});
  }
  await expect(page.getByText('Leitura do monitor não configurada.',{exact:false})).toBeVisible();
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>({target:n.target,details:n.failureSummary}))}))).toEqual([]);
  await page.screenshot({path:`.backend-ci/browser-results/intelligence-${width}.jpg`,fullPage:true});
 }
 for(const width of [320,768]){
  await page.setViewportSize({width,height:900});
  for(const [area,button] of [['Decisões','Registrar decisão'],['Mudanças','Registrar mudança'],['Capacidade','Registrar medição'],['Funcionalidades','Registrar funcionalidade']]){
   await areas.getByRole('button',{name:area,exact:true}).click();await page.getByRole('button',{name:button,exact:true}).click();
   await expect(page.getByRole('dialog')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>({target:n.target,details:n.failureSummary}))}))).toEqual([]);
   await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();
  }
 }
 await areas.getByRole('button',{name:'Continuidade',exact:true}).click();
 const monitorCard=page.getByRole('heading',{name:'Cobertura do monitor independente',exact:true}).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")]');
 providerState='available';await monitorCard.getByRole('button',{name:'Atualizar',exact:true}).click();await expect(monitorCard).toContainText('Cobertura completa nas janelas avaliadas');
 providerState='failure';await monitorCard.getByRole('button',{name:'Atualizar',exact:true}).click();await expect(monitorCard.getByRole('alert')).toBeVisible();await expect(monitorCard).toContainText('Cobertura completa nas janelas avaliadas');
 expect(errors).toEqual([]);
});
