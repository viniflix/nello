import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { assertIsolatedRuntime } from '../scripts/qa/isolated-runtime.mjs';
import { relevantDiagnostic } from '../scripts/qa/diagnostic-policy.mjs';
assertIsolatedRuntime();
test.use({timezoneId:'America/Fortaleza'});
test.afterEach(async({page},info)=>{
    if(info.status!==info.expectedStatus)await info.attach('meal-plan-interactions',{body:JSON.stringify(await page.evaluate(()=>window.__mealModuleInteractions || [])),contentType:'application/json'});
});
const fixture = JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json'));
if (fixture.url !== 'http://localhost:54321') throw Error('Disposable loopback stack required');
function seed() {
    const patient = randomUUID(), actor = fixture.personas['nutritionist-a'].id;
    const output = execFileSync('docker', ['exec', '-i', '-e', 'PGPASSWORD=postgres', 'supabase_db_nello-reconstruction', 'psql', '-X', '-At', '-h', '127.0.0.1', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
        encoding:'utf8', input:`INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data) VALUES('${patient}','authenticated','authenticated','${patient}@example.invalid','{"name":"QA Meal Module","user_type":"patient"}');
        UPDATE public.user_profiles SET nutritionist_id='${actor}' WHERE id='${patient}';
        INSERT INTO public.nutritionist_patients(nutritionist_id,patient_id,status) VALUES('${actor}','${patient}','active');
        WITH plan AS (INSERT INTO public.meal_plans(patient_id,nutritionist_id,name,start_date,is_active,is_draft,daily_calories,daily_protein,daily_carbs,daily_fat,plan_mode) VALUES('${patient}','${actor}','QA Plano completo com nome longo para testar leitura e navegação','2026-10-03',true,false,100,0,25,0,'hybrid') RETURNING id)
        INSERT INTO public.meal_plan_meals(meal_plan_id,name,meal_type,meal_time,order_index,total_calories,total_protein,total_carbs,total_fat,include_in_totals)
        SELECT id,'QA Refeição alternativa','dinner'::public.meal_type_enum,'20:00'::time,0,300,0,75,0,false FROM plan UNION ALL SELECT id,'QA Café da manhã com nome longo','breakfast'::public.meal_type_enum,'08:00'::time,1,100,0,25,0,true FROM plan;
        SELECT id FROM public.meal_plans WHERE patient_id='${patient}';`, stdio:['pipe','pipe','pipe'],
    });
    return {patient,plan:Number(output.trim().split('\n').at(-1))};
}
async function audit(page) {
    const result = await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    expect(result.violations.map(item=>({id:item.id,nodes:item.nodes.map(node=>({target:node.target,summary:node.failureSummary}))}))).toEqual([]);
    const overflow=await page.evaluate(()=>[...document.querySelectorAll('#root *')].filter(node=>{ let parent=node.parentElement; while(parent&&parent!==document.body){if(['auto','scroll','hidden','clip'].includes(getComputedStyle(parent).overflowX))return false;parent=parent.parentElement;}return node.getBoundingClientRect().right>innerWidth+1||(getComputedStyle(node).overflowX==='visible'&&node.scrollWidth>node.clientWidth+1);}).slice(0,30).map(node=>({tag:node.tagName,classes:node.className,text:node.textContent?.slice(0,50),scroll:node.scrollWidth,client:node.clientWidth})));
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),JSON.stringify(overflow)).toBe(true);
    await page.evaluate(()=>window.scrollTo({top:0,left:0,behavior:'instant'}));
    await test.info().attach('meal-plan-module-view', {body:await page.screenshot({fullPage:true}),contentType:'image/png'});
}
for (const screen of [{width:320,height:720},{width:768,height:480},{width:1440,height:900},{width:640,height:900,zoom:true},{width:320,height:900,zoom:true}]) {
    test(`complete meal-plan overview, preview, summary and keyboard reflow ${screen.width}${screen.zoom?' zoom200':''}`,async({page})=>{
        const errors=[];
        await page.addInitScript(()=>{
            window.__mealModuleInteractions=[];
            for(const type of ['pointerdown','click','keydown','focusin'])document.addEventListener(type,event=>{
                window.__mealModuleInteractions.push({type,key:event.key,tag:event.target?.tagName,label:event.target?.getAttribute?.('aria-label'),text:event.target?.textContent?.slice(0,80)});
                window.__mealModuleInteractions=window.__mealModuleInteractions.slice(-30);
            },true);
        });
        page.on('pageerror',error=>errors.push(error.message));
        page.on('console',message=>{if(relevantDiagnostic(message.text()))errors.push(message.text());});
        const sample=seed();
        await page.setViewportSize({width:screen.width,height:screen.height});await page.emulateMedia({reducedMotion:'reduce'});
        await page.goto('/login');await page.locator('#email').fill(fixture.personas['nutritionist-a'].email);await page.locator('#password').fill(fixture.password);
        await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page).toHaveURL(/\/nutritionist/);
        const route=`/nutritionist/patients/${sample.patient}/meal-plan`;
        await page.goto(route);await expect(page.getByRole('button',{name:'Editar Plano',exact:true})).toBeVisible();
        await expect(page.getByText('03/10/2026',{exact:true})).toBeVisible();
        if(screen.zoom)await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
        await expect(page.getByRole('button',{name:'Exportar PDF',exact:true})).toBeVisible();
        for(const name of ['Macronutrientes','Micronutrientes'])expect(await page.getByRole('button',{name,exact:true}).evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
        const meals=page.locator('summary');await expect(meals.first()).toContainText('QA Refeição alternativa');await expect(meals.first()).not.toContainText('% do dia');
        await meals.nth(1).focus();await page.keyboard.press('Enter');await expect(page.getByText('Nenhum alimento nesta refeição.').last()).toBeVisible();await audit(page);
        await page.getByRole('button',{name:/Meus Planos/}).click();await page.getByRole('button',{name:/Ver QA Plano/}).click();
        const preview=page.getByRole('dialog').filter({hasText:'Confira refeições e porções sem alterar o plano.'});await expect(preview).toBeVisible();await expect(preview.getByRole('heading',{name:/QA Plano completo/})).toBeVisible();await audit(page);
        await preview.getByRole('button',{name:'Fechar prévia'}).click();
        const planList=page.getByRole('dialog',{name:'Planos Alimentares',exact:true});
        await expect(planList).toBeVisible();
        const planSearch=planList.getByRole('textbox',{name:'Buscar planos alimentares'});
        await expect(planSearch).toBeFocused();
        await planSearch.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
        await page.getByRole('button',{name:'Análise Completa'}).click();await expect(page.getByRole('heading',{name:'Resumo nutricional'})).toBeVisible();
        if(screen.zoom)await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
        await expect(page.getByRole('list',{name:'Distribuição de energia por refeição'})).not.toContainText('QA Refeição alternativa');await audit(page);
        await page.getByRole('button',{name:'Voltar aos planos'}).click();await expect(page).toHaveURL(new RegExp(route+'$'));
        await expect(page.getByRole('button',{name:'Novo Plano'})).toBeVisible();
        expect(errors).toEqual([]);
    });
}
