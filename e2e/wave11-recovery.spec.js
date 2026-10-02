import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const fixture=JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json'));
async function login(page){await page.goto('/login');await page.locator('#email').fill(fixture.personas['nutritionist-a'].email);await page.locator('#password').fill(fixture.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page).toHaveURL(/\/nutritionist/);}
test('patient list recovers from query failure and remains stable across empty lists/viewports/views',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));await login(page);
 let fail=true,empty=false,calls=0;
 await page.route('**/rest/v1/rpc/list_nutritionist_care_patients',route=>{calls++;return fail?route.abort('failed'):empty?route.fulfill({status:200,contentType:'application/json',body:'[]'}):route.continue();});
 await page.goto('/nutritionist/patients');await expect(page.getByRole('button',{name:'Tentar novamente',exact:true})).toBeVisible();
 const before=calls;await page.getByPlaceholder('Procurar paciente (Nome, Email, CPF...)').fill('no matching patient');expect(calls).toBe(before);
 fail=false;await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();await page.getByPlaceholder('Procurar paciente (Nome, Email, CPF...)').fill('');await expect(page.getByText('QA patient-a',{exact:false}).first()).toBeVisible();
 for(const width of [390,768,1440,390]){await page.setViewportSize({width,height:844});await page.getByLabel('List view').click();await page.getByLabel('Grid view').click();}
 empty=true;await page.reload();await expect(page.getByText('Nenhum paciente encontrado.',{exact:true})).toBeVisible();
 expect(errors.filter(message=>/Maximum update depth|ResizeObserver loop/i.test(message))).toEqual([]);
});
test('simultaneous dashboard outage has one recovery surface and does not invalidate navigation',async({page})=>{
 await login(page);await page.goto('/nutritionist/patients');await expect(page.getByText('QA patient-a',{exact:false}).first()).toBeVisible();
 await page.route('**/rest/v1/appointments?**',route=>route.abort('failed'));
 await page.locator('a[href="/nutritionist"]:visible').first().click();await expect(page.getByText('Alguns dados não foram atualizados',{exact:true})).toBeVisible();
 await expect(page.locator('header')).toBeVisible();await page.unroute('**/rest/v1/appointments?**');await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();await expect(page.getByText('Alguns dados não foram atualizados',{exact:true})).toBeHidden();
});
test('an old lazy chunk is contained inside the portal without automatic reload',async({page})=>{
 await login(page);const navigation=await page.evaluate(()=>performance.timeOrigin);
 await page.route('**/assets/PatientsPage-*.js',route=>route.abort('failed'));
 await page.locator('a[href="/nutritionist/patients"]:visible').first().click();
 await expect(page.getByText('Uma atualização está disponível',{exact:true})).toBeVisible();await expect(page.locator('header')).toBeVisible();
 expect(await page.evaluate(()=>performance.timeOrigin)).toBe(navigation);
 await page.locator('a[href="/nutritionist"]:visible').first().click();await expect(page.getByText('Uma atualização está disponível',{exact:true})).toBeHidden();
});

test('extracted clinical controllers load goals, exams, anthropometry and patient progress without render failures',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await login(page);
 const id=fixture.personas['patient-a'].id;
 for(const [suffix,title] of [['goals','Metas Nutricionais'],['lab-results','Exames Laboratoriais'],['anthropometry','Avaliação Antropométrica']]){
   await page.goto(`/nutritionist/patients/${id}/${suffix}`);
   await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
   await expect(page.getByRole('heading',{name:'Não foi possível abrir esta área',exact:true})).toHaveCount(0);
   if(suffix==='lab-results'){
     await page.getByRole('button',{name:'Adicionar Exame',exact:true}).click();
     await expect(page.getByRole('dialog')).toBeVisible();
     await page.keyboard.press('Escape');
   }
 }
 await page.goto('/nutritionist/templates?group=foodbank');
 await page.getByRole('button',{name:'Novo Alimento',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await expect(page.getByRole('heading',{name:'Novo Alimento Personalizado',exact:true})).toBeVisible();
 await page.keyboard.press('Escape');
 // Use a fresh browser context for the other role: no identity or clinical state is shared.
 const patientContext=await page.context().browser().newContext();
 const patientPage=await patientContext.newPage();patientPage.on('pageerror',error=>errors.push(error.message));
 await patientPage.goto(new URL('/login',page.url()).href);
 await patientPage.locator('#email').fill(fixture.personas['patient-a'].email);
 await patientPage.locator('#password').fill(fixture.password);
 await patientPage.getByRole('button',{name:'Entrar',exact:true}).click();
 await expect(patientPage).toHaveURL(/\/patient/);
 await patientPage.goto(new URL('/patient/progresso',page.url()).href);
 await expect(patientPage.getByRole('heading',{name:/Progresso|Evolução/i}).first()).toBeVisible();
 await expect(patientPage.getByRole('heading',{name:'Não foi possível abrir esta área',exact:true})).toHaveCount(0);
 await patientContext.close();expect(errors).toEqual([]);
});
