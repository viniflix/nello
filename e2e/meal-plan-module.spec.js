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
        INSERT INTO public.patient_module_sync_flags(patient_id,needs_meal_plan_review) VALUES('${patient}',true);
        INSERT INTO public.nutritionist_patients(nutritionist_id,patient_id,status) VALUES('${actor}','${patient}','active');
        WITH plan AS (INSERT INTO public.meal_plans(patient_id,nutritionist_id,name,start_date,is_active,is_draft,daily_calories,daily_protein,daily_carbs,daily_fat,plan_mode) VALUES('${patient}','${actor}','QA Plano completo com nome longo para testar leitura e navegação','2026-10-03',true,false,100,0,25,0,'hybrid') RETURNING id)
        INSERT INTO public.meal_plan_meals(meal_plan_id,name,meal_type,meal_time,order_index,total_calories,total_protein,total_carbs,total_fat,include_in_totals)
        SELECT id,'QA Refeição alternativa','dinner'::public.meal_type_enum,'20:00'::time,0,300,0,75,0,false FROM plan UNION ALL SELECT id,'QA Café da manhã com nome longo','breakfast'::public.meal_type_enum,'08:00'::time,1,100,0,25,0,true FROM plan;
        UPDATE public.meal_plans SET active_days=to_jsonb(ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday']) WHERE patient_id='${patient}';
        SELECT set_config('request.jwt.claims','{"sub":"${actor}","role":"authenticated"}',false);
        INSERT INTO public.energy_expenditure_calculations(patient_id,nutritionist_id,age,gender,weight,height,get_result,final_planned_kcal,protocol_code,protocol_version,confirmed_by)
        VALUES('${patient}','${actor}',30,'female',60,165,2000,2000,'energy.mifflin_st_jeor',1,'${actor}');
        WITH food AS (INSERT INTO public.nutritionist_foods(nutritionist_id,name,energy_kcal,carbohydrate_g) VALUES('${actor}','QA Alimento do café',100,25) RETURNING id)
        INSERT INTO public.meal_plan_foods(meal_plan_meal_id,food_id,quantity,unit,calories,protein,carbs,fat,patient_description)
        SELECT meal.id,food.id,CASE WHEN meal.meal_type='breakfast' THEN 100 ELSE 300 END,'gram',CASE WHEN meal.meal_type='breakfast' THEN 100 ELSE 300 END,0,CASE WHEN meal.meal_type='breakfast' THEN 25 ELSE 75 END,0,CASE WHEN meal.meal_type='dinner' THEN 'QA Porção alternativa' ELSE null END FROM food,public.meal_plan_meals meal JOIN public.meal_plans plan ON plan.id=meal.meal_plan_id WHERE plan.patient_id='${patient}';
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
    await test.info().attach('meal-plan-module-view', {body:await page.screenshot({fullPage:!(await page.getByRole('dialog').count())}),contentType:'image/png'});
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
        await expect(page.getByText('Início em 03/10/2026',{exact:true})).toBeVisible();
        if(screen.zoom)await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
        await expect(page.getByRole('button',{name:'Exportar PDF',exact:true})).toBeVisible();
        await expect(page.getByRole('heading',{name:'Plano alimentar requer revisão'})).toBeVisible();
        for(const name of ['Macronutrientes','Micronutrientes'])expect(await page.getByRole('button',{name,exact:true}).evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
        const meals=page.getByRole('region',{name:'Refeições do plano',exact:true}).locator('summary');await expect(meals.first()).toContainText('QA Refeição alternativa');await expect(meals.first()).not.toContainText('% do dia');
        await meals.nth(1).focus();await page.keyboard.press('Enter');await expect(page.getByText('QA Alimento do café',{exact:true})).toBeVisible();await audit(page);
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
        await expect(page.getByRole('button',{name:'Novo Plano',exact:true})).toBeVisible();
        expect(errors).toEqual([]);
    });
}

test('contextual food editing preserves the plan and returns to the workspace after saving', async ({page}) => {
    const sample=seed();
    await page.setViewportSize({width:1440,height:900});
    await page.goto('/login');
    await page.locator('#email').fill(fixture.personas['nutritionist-a'].email);
    await page.locator('#password').fill(fixture.password);
    await page.getByRole('button',{name:'Entrar',exact:true}).click();
    await expect(page).toHaveURL(/\/nutritionist/);
    await page.goto(`/nutritionist/patients/${sample.patient}/meal-plan`);
    await page.getByRole('region',{name:'Refeições do plano',exact:true}).locator('summary').nth(1).click();
    await page.getByRole('button',{name:'Ações de QA Alimento do café',exact:true}).click();
    await page.getByRole('menuitem',{name:'Editar alimento e porção',exact:true}).click();
    const food=page.getByRole('dialog',{name:'Editar Alimento',exact:true});
    await expect(food).toBeVisible();
    await food.getByLabel('Descrição para o paciente',{exact:true}).fill('QA Porção revisada');
    await food.getByRole('button',{name:'Atualizar',exact:true}).click();
    const meal=page.getByRole('dialog',{name:'Editar Refeição',exact:true});
    await expect(meal.getByText('QA Porção revisada',{exact:true})).toBeVisible();
    await meal.getByRole('button',{name:'Atualizar Refeição',exact:true}).click();
    await page.getByRole('button',{name:'Salvar alterações',exact:true}).click();
    await expect(page.getByRole('button',{name:'Editar Plano',exact:true})).toBeVisible();
    await page.getByRole('region',{name:'Refeições do plano',exact:true}).locator('summary').nth(1).click();
    await expect(page.getByText('QA Porção revisada',{exact:true})).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button',{name:'Editar Plano',exact:true})).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
});

for (const {width, zoom} of [{width:320}, {width:390}, {width:430}, {width:768}, {width:320,zoom:true}]) {
    test(`mobile meal editors keep search, portions and substitutions usable at ${width}px${zoom ? ' text200' : ''}`, async ({page}) => {
        const sample = seed();
        await page.setViewportSize({width,height:844});
        await page.emulateMedia({reducedMotion:'reduce'});
        await page.goto('/login');
        await page.locator('#email').fill(fixture.personas['nutritionist-a'].email);
        await page.locator('#password').fill(fixture.password);
        await page.getByRole('button',{name:'Entrar',exact:true}).click();
        await expect(page).toHaveURL(/\/nutritionist/);
        await page.goto(`/nutritionist/patients/${sample.patient}/meal-plan`);
        await page.getByRole('region',{name:'Refeições do plano',exact:true}).locator('summary').nth(1).click();
        await page.getByRole('button',{name:'Ações de QA Alimento do café',exact:true}).click();
        await page.getByRole('menuitem',{name:'Editar alimento e porção',exact:true}).click();
        const food = page.getByRole('dialog',{name:'Editar Alimento',exact:true});
        await expect(food.getByLabel('Quantidade',{exact:true})).toBeVisible();
        if (zoom) await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
        await food.getByLabel('Quantidade',{exact:true}).fill('200');
        await food.getByRole('button',{name:'1 · Buscar alimento',exact:true}).click();
        await expect(food.getByLabel('1 · Escolha o alimento',{exact:true})).toBeVisible();
        await expect(food.getByLabel('Quantidade',{exact:true})).not.toBeVisible();
        await food.getByRole('button',{name:'2 · Ajustar porção',exact:true}).click();
        await expect(food.getByLabel('Quantidade',{exact:true})).toHaveValue('200');
        await audit(page);
        await food.getByRole('button',{name:'Atualizar',exact:true}).click();
        const meal = page.getByRole('dialog',{name:'Editar Refeição',exact:true});
        await expect(meal.getByText(/200g/)).toBeVisible();
        await meal.getByRole('button',{name:'Substituições de QA Alimento do café',exact:true}).click();
        const substitutions = page.getByRole('dialog',{name:'Substituições de alimento',exact:true});
        const search = substitutions.getByLabel('1 · Escolha o alimento',{exact:true});
        await expect(search).toBeVisible();
        await search.fill('QA Alimento');
        const results = substitutions.getByRole('button',{name:/QA Alimento do café.*100/});
        await expect(results.first()).toBeVisible();
        const resultArea = substitutions.locator('[aria-live="polite"]');
        expect(await resultArea.evaluate(element=>element.clientHeight)).toBeGreaterThan(100);
        await results.first().click();
        await expect(substitutions.getByRole('heading',{name:'Comparação das porções'})).toBeVisible();
        await expect(search).not.toBeVisible();
        await audit(page);
        await substitutions.getByRole('button',{name:'Salvar substituições',exact:true}).click();
        await expect(meal.getByText('1 substitutos',{exact:true})).toBeVisible();
        await meal.getByRole('button',{name:'Atualizar Refeição',exact:true}).click();
        await expect(meal).not.toBeVisible();
        await page.getByRole('button',{name:'Salvar alterações',exact:true}).click();
        await expect(page.getByRole('button',{name:'Editar Plano',exact:true})).toBeVisible();
        await page.reload();
        await expect(page.getByRole('button',{name:'Editar Plano',exact:true})).toBeVisible();
        await expect(page.getByRole('dialog')).toHaveCount(0);
    });
}

test('quick food creation has scoped labels, optional macros and accepts a zero portion inside the meal editor', async ({page}) => {
    const sample = seed();
    const name = `QA alimento sem nutrientes ${randomUUID().slice(0,8)}`;
    await page.setViewportSize({width:390,height:844});
    await page.goto('/login');
    await page.locator('#email').fill(fixture.personas['nutritionist-a'].email);
    await page.locator('#password').fill(fixture.password);
    await page.getByRole('button',{name:'Entrar',exact:true}).click();
    await expect(page).toHaveURL(/\/nutritionist/);
    await page.goto(`/nutritionist/patients/${sample.patient}/meal-plan`);
    await page.getByRole('button',{name:'Editar refeição QA Café da manhã com nome longo',exact:true}).click();
    const meal = page.getByRole('dialog',{name:'Editar Refeição',exact:true});
    await meal.getByRole('button',{name:'Adicionar Alimento',exact:true}).click();
    const food = page.getByRole('dialog',{name:'Adicionar Alimento',exact:true});
    await food.getByRole('button',{name:'Cadastrar alimento personalizado',exact:true}).click();
    const quick = page.getByRole('dialog',{name:'Cadastrar Alimento Personalizado',exact:true});
    await quick.getByLabel('Nome do Alimento *',{exact:true}).fill(name);
    await audit(page);
    await quick.getByRole('button',{name:'Próximo',exact:true}).click();
    await expect(quick.getByLabel('Proteína (g)',{exact:true})).toHaveValue('');
    await quick.getByRole('button',{name:'Próximo',exact:true}).click();
    await quick.getByRole('button',{name:'Pular',exact:true}).click();
    await quick.getByRole('button',{name:'Pular',exact:true}).click();
    await quick.getByRole('button',{name:'Criar Alimento',exact:true}).click();
    await expect(quick).not.toBeVisible();
    await expect(food.getByRole('heading',{name,exact:true})).toBeVisible();
    await food.getByLabel('Quantidade',{exact:true}).fill('0');
    await food.getByRole('button',{name:'Adicionar',exact:true}).click();
    await expect(food).not.toBeVisible();
    await expect(meal.getByText(name,{exact:true})).toBeVisible();
    await meal.getByRole('button',{name:'Atualizar Refeição',exact:true}).click();
    await expect(meal).not.toBeVisible();
    await page.getByRole('button',{name:'Salvar alterações',exact:true}).click();
    await expect(page.getByRole('button',{name:'Editar Plano',exact:true})).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button',{name:'Editar Plano',exact:true})).toBeVisible();
    await page.getByRole('region',{name:'Refeições do plano',exact:true}).locator('summary').nth(1).click();
    await expect(page.getByText(name,{exact:true})).toBeVisible();
});

test('restoring a historical version preserves the active plan, alternatives and nutritional totals after reload', async ({page}) => {
    const sample=seed();
    await page.goto('/login');
    await page.locator('#email').fill(fixture.personas['nutritionist-a'].email);
    await page.locator('#password').fill(fixture.password);
    await page.getByRole('button',{name:'Entrar',exact:true}).click();
    await expect(page).toHaveURL(/\/nutritionist/);
    await page.goto(`/nutritionist/patients/${sample.patient}/meal-plan`);
    await page.getByRole('button',{name:'Editar refeição QA Café da manhã com nome longo',exact:true}).click();
    const meal=page.getByRole('dialog',{name:'Editar Refeição',exact:true});
    await meal.getByRole('button',{name:'Atualizar Refeição',exact:true}).click();
    await page.getByRole('button',{name:'Salvar alterações',exact:true}).click();
    await expect(page.getByRole('button',{name:'Editar Plano',exact:true})).toBeVisible();
    await page.getByRole('tab',{name:/Histórico/}).click();
    await page.getByRole('button',{name:/Histórico de Versões/}).click();
    await page.getByLabel('Comparar plano atual com versão').selectOption({index:1});
    page.once('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:'Restaurar versão',exact:true}).click();
    await expect(page.getByText('Versão Restaurada',{exact:true})).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button',{name:'Editar Plano',exact:true})).toBeVisible();
    await expect(page.getByRole('definition').filter({hasText:'100 kcal'}).first()).toBeVisible();
    const meals=page.getByRole('region',{name:'Refeições do plano',exact:true});
    await expect(meals.locator('summary').getByText('300 kcal',{exact:true})).toBeVisible();
    await expect(meals.getByText('Opção alternativa · fora dos totais',{exact:true})).toBeVisible();
    await audit(page);
});

test('saving a reusable model and importing it opens a real draft editor without replacing the active prescription', async ({page})=>{
    const sample=seed(), name=`QA modelo ${randomUUID().slice(0,8)}`;
    await page.setViewportSize({width:390,height:844});
    await page.goto('/login');
    await page.locator('#email').fill(fixture.personas['nutritionist-a'].email);
    await page.locator('#password').fill(fixture.password);
    await page.getByRole('button',{name:'Entrar',exact:true}).click();
    await expect(page).toHaveURL(/\/nutritionist/);
    await page.goto(`/nutritionist/patients/${sample.patient}/meal-plan`);
    await page.getByRole('button',{name:'Mais ações do plano',exact:true}).click();
    await page.getByRole('menuitem',{name:'Salvar como modelo',exact:true}).click();
    const save=page.getByRole('dialog',{name:'Salvar Plano como Modelo',exact:true});
    await save.getByLabel('Nome do Modelo *',{exact:true}).fill(name);
    await save.getByRole('button',{name:'Salvar Modelo',exact:true}).click();
    await expect(save).not.toBeVisible();
    await page.getByRole('button',{name:'Importar modelo',exact:true}).click();
    const models=page.getByRole('dialog',{name:'Importar Protocolo de Dieta',exact:true});
    await models.getByRole('button',{name:new RegExp(name)}).click();
    await expect(models.getByRole('button',{name:'Abrir cópia para revisão',exact:true})).toBeEnabled();
    await audit(page);
    await models.getByRole('button',{name:'Abrir cópia para revisão',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Editar plano alimentar',exact:true})).toBeVisible();
    await expect(page.getByLabel('Nome do Plano *',{exact:true})).toHaveValue(name);
    const {createClient}=await import('@supabase/supabase-js');
    const client=createClient(fixture.url,fixture.anonKey,{auth:{persistSession:false}});
    await client.auth.signInWithPassword({email:fixture.personas['nutritionist-a'].email,password:fixture.password});
    const persisted=await client.from('meal_plans').select('is_active,is_draft').eq('id',sample.plan).single();
    expect(persisted.error).toBeNull();
    expect(persisted.data).toMatchObject({is_active:true,is_draft:false});
});
