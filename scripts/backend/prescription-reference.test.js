// @vitest-environment node
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';

it('captures trusted references and preserves historical snapshots across edits and catalog changes',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create schema private;
   create table foods(id bigint primary key,name text,source text,source_id text,portion_size numeric,base_unit text,
    calories numeric,protein numeric,carbs numeric,fat numeric,fiber numeric,sodium numeric,is_active boolean);
   create table food_measures(id bigint,label text,weight_in_grams numeric,version int,source_snapshot jsonb,
    reference_food_id bigint,nutritionist_food_id bigint,created_at timestamptz);
   create table meal_plan_foods(id bigint primary key,food_id bigint,unit text,quantity numeric,food_snapshot jsonb,measure_snapshot jsonb);
   insert into foods values(1,'Original','reference','a',100,'g',10,1,2,3,4,5,true),(2,'Replacement','reference','b',100,'g',20,1,2,3,4,5,true);
   insert into food_measures values(1,'cup',100,1,'{}',1,null,now());`);
  const migration=readFileSync('supabase/migrations/releases/20260930203000_clinical_adversarial_boundaries.sql','utf8');
  await db.exec(migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION private.freeze_prescription_food_reference()'),migration.indexOf('CREATE OR REPLACE FUNCTION private.capture_energy_calculation_snapshot()')));
  await db.exec(`insert into meal_plan_foods values(1,1,'cup',1,'{"name":"forged"}','{"weight_in_grams":999}');`);
  const original=(await db.query('select food_snapshot,measure_snapshot from meal_plan_foods where id=1')).rows[0];
  expect(original.food_snapshot.name).toBe('Original');
  expect(original.measure_snapshot.weight_in_grams).toBe(100);
  await db.exec(`update foods set name='Updated catalog',is_active=false where id=1;
   update food_measures set weight_in_grams=200 where id=1;
   update meal_plan_foods set quantity=2,food_snapshot='{"name":"forged"}',measure_snapshot='{"weight_in_grams":999}' where id=1;`);
  expect((await db.query('select food_snapshot,measure_snapshot from meal_plan_foods where id=1')).rows[0]).toEqual(original);
  await db.exec("update meal_plan_foods set food_id=2,unit='g' where id=1");
  const replacement=(await db.query('select food_snapshot,measure_snapshot from meal_plan_foods where id=1')).rows[0];
  expect(replacement.food_snapshot.name).toBe('Replacement');
  expect(replacement.measure_snapshot).toEqual({label:'g',kind:'prescription_unit'});
  await expect(db.exec("insert into meal_plan_foods(id,food_id,unit) values(2,1,'g')")).rejects.toMatchObject({code:'23514',message:'prescription_food_inactive'});
  await expect(db.exec("update meal_plan_foods set food_id=999 where id=1")).rejects.toMatchObject({code:'23503',message:'prescription_food_not_found'});
 }finally{await db.close();}
},20000);
