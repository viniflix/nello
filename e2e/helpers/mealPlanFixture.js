import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const fixture = JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json'));
if (fixture.url !== 'http://localhost:54321') throw Error('Disposable loopback stack required');
export function seed() {
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
